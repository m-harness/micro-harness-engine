/**
 * McpClient — manages a single MCP server connection.
 * Handles initialize handshake, tool discovery, request/response correlation, reconnection.
 */

import { buildRequest, buildNotification } from './protocol.js'
import { StdioTransport, HttpTransport } from './transport.js'

const INITIALIZE_TIMEOUT = 15_000
const REQUEST_TIMEOUT = 30_000
const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAY_BASE = 2000

export class McpClient {
	constructor(serverName, serverConfig) {
		this.serverName = serverName
		this.serverConfig = serverConfig
		this.state = 'disconnected' // disconnected | connecting | ready | failed
		this.transport = null
		this.nextRequestId = 1
		this.pendingRequests = new Map()
		this.tools = []
		this.lastError = null
		this._reconnectAttempts = 0
	}

	async start() {
		this.state = 'connecting'
		try {
			this._createTransport()
			this.transport.start(message => this._handleMessage(message))
			await this._initialize()
			await this._discoverTools()
			this.state = 'ready'
			this.lastError = null
			this._reconnectAttempts = 0
			console.log(`[mcp] Server "${this.serverName}" ready (${this.tools.length} tools)`)
		} catch (error) {
			this.lastError = error.message
			console.error(`[mcp] Server "${this.serverName}" failed to start:`, error.message)
			await this._tryReconnect()
		}
	}

	async stop() {
		this.state = 'disconnected'
		this.tools = []
		for (const [, pending] of this.pendingRequests) {
			clearTimeout(pending.timer)
			pending.reject(new Error('Client stopped'))
		}
		this.pendingRequests.clear()
		if (this.transport) {
			await this.transport.stop()
			this.transport = null
		}
	}

	_createTransport() {
		if (this.serverConfig.url) {
			this.transport = new HttpTransport({
				url: this.serverConfig.url,
				headers: this.serverConfig.headers || {}
			})
		} else {
			this.transport = new StdioTransport({
				command: this.serverConfig.command,
				args: this.serverConfig.args || [],
				env: this.serverConfig.env || {}
			})
		}
	}

	async _initialize() {
		const result = await this._sendRequest('initialize', {
			protocolVersion: '2024-11-05',
			capabilities: {},
			clientInfo: {
				name: 'microHarnessEngine',
				version: '1.0.0'
			}
		}, INITIALIZE_TIMEOUT)

		// notification送信はfire-and-forget（サーバーによりSSEで返ってsend()がブロックされうる）
		this._sendNotification('notifications/initialized')
		return result
	}

	_sendNotification(method, params) {
		try {
			const result = this.transport.send(buildNotification(method, params))
			if (result instanceof Promise) {
				result.catch(error => {
					console.warn(`[mcp] Notification "${method}" failed for "${this.serverName}":`, error.message)
				})
			}
		} catch (error) {
			console.warn(`[mcp] Notification "${method}" failed for "${this.serverName}":`, error.message)
		}
	}

	async _discoverTools() {
		const tools = []
		let cursor

		// ページネーション対応: nextCursorがある限り取得を続ける
		do {
			const params = cursor ? { cursor } : {}
			const result = await this._sendRequest('tools/list', params)
			if (result?.tools) {
				tools.push(...result.tools)
			}
			cursor = result?.nextCursor
		} while (cursor)

		this.tools = tools
	}

	getToolDefinitions() {
		if (this.state !== 'ready') {
			return []
		}
		return this.tools.map(tool => ({
			name: `${this.serverName}__${tool.name}`,
			description: tool.description || '',
			input_schema: tool.inputSchema || { type: 'object', properties: {}, required: [] }
		}))
	}

	async callTool(toolName, args) {
		if (this.state !== 'ready') {
			throw new Error(`Server "${this.serverName}" is not ready (state: ${this.state})`)
		}
		return this._sendRequest('tools/call', {
			name: toolName,
			arguments: args || {}
		})
	}

	_sendRequest(method, params, timeout = REQUEST_TIMEOUT) {
		const id = this.nextRequestId++
		const data = buildRequest(id, method, params)

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingRequests.delete(id)
				reject(new Error(`Request "${method}" timed out after ${timeout}ms`))
			}, timeout)

			this.pendingRequests.set(id, { resolve, reject, timer })

			try {
				const sendResult = this.transport.send(data)
				if (sendResult instanceof Promise) {
					sendResult.catch(error => {
						clearTimeout(timer)
						this.pendingRequests.delete(id)
						reject(error)
					})
				}
			} catch (error) {
				clearTimeout(timer)
				this.pendingRequests.delete(id)
				reject(error)
			}
		})
	}

	_handleMessage(message) {
		if (message.id !== undefined && this.pendingRequests.has(message.id)) {
			const pending = this.pendingRequests.get(message.id)
			this.pendingRequests.delete(message.id)
			clearTimeout(pending.timer)

			if (message.error) {
				pending.reject(new Error(`MCP error ${message.error.code}: ${message.error.message}`))
			} else {
				pending.resolve(message.result)
			}
			return
		}

		if (message.method && message.id === undefined) {
			// サーバーからの通知
			if (message.method === 'notifications/tools/list_changed') {
				// ツール一覧が変わった — 再取得
				this._discoverTools().catch(error => {
					console.warn(`[mcp] Tool re-discovery failed for "${this.serverName}":`, error.message)
				})
			}
			return
		}
	}

	async _tryReconnect() {
		this._reconnectAttempts++
		if (this._reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
			this.state = 'failed'
			console.error(`[mcp] Server "${this.serverName}" failed after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts`)
			return
		}

		const delay = RECONNECT_DELAY_BASE * this._reconnectAttempts
		console.log(`[mcp] Reconnecting "${this.serverName}" in ${delay}ms (attempt ${this._reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)

		if (this.transport) {
			await this.transport.stop()
			this.transport = null
		}

		await new Promise(resolve => setTimeout(resolve, delay))
		await this.start()
	}
}
