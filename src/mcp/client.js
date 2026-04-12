/**
 * McpClient — manages a single MCP server connection.
 * Uses official @modelcontextprotocol/sdk for protocol and transport.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'

const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAY_BASE = 2000

export class McpClient {
	constructor(serverName, serverConfig) {
		this.serverName = serverName
		this.serverConfig = serverConfig
		this.state = 'disconnected' // disconnected | connecting | ready | failed
		this.tools = []
		this.lastError = null
		this._reconnectAttempts = 0
		/** @type {Map<string, string>} sanitized tool name → original MCP tool name */
		this._toolNameMap = new Map()
		this._sdkClient = null
		this._sdkTransport = null
	}

	async start() {
		this.state = 'connecting'
		try {
			this._createTransport()
			this._sdkClient = new Client(
				{ name: 'microHarnessEngine', version: '1.0.0' },
				{ capabilities: {} }
			)

			this._sdkClient.setNotificationHandler(
				ToolListChangedNotificationSchema,
				async () => {
					await this._discoverTools().catch(err =>
						console.warn(`[mcp] Tool re-discovery failed for "${this.serverName}":`, err.message)
					)
				}
			)

			this._sdkClient.onclose = () => {
				if (this.state === 'ready') {
					this.state = 'disconnected'
					this._tryReconnect().catch(err => {
						this.state = 'failed'
						console.error(`[mcp] Reconnection failed for "${this.serverName}":`, err.message)
					})
				}
			}

			this._sdkClient.onerror = (error) => {
				console.warn(`[mcp] Transport error for "${this.serverName}":`, error.message)
			}

			await this._sdkClient.connect(this._sdkTransport)
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
		if (this._sdkClient) {
			try { await this._sdkClient.close() } catch {}
			this._sdkClient = null
		}
		this._sdkTransport = null
	}

	_createTransport() {
		if (this.serverConfig.url) {
			this._sdkTransport = new StreamableHTTPClientTransport(
				new URL(this.serverConfig.url),
				{ requestInit: { headers: this.serverConfig.headers || {} } }
			)
		} else {
			this._sdkTransport = new StdioClientTransport({
				command: this.serverConfig.command,
				args: this.serverConfig.args || [],
				env: { ...process.env, ...(this.serverConfig.env || {}) }
			})
		}
	}

	async _discoverTools() {
		const tools = []
		let cursor

		do {
			const result = await this._sdkClient.listTools(cursor ? { cursor } : undefined)
			if (result?.tools) {
				tools.push(...result.tools)
			}
			cursor = result?.nextCursor
		} while (cursor)

		this.tools = tools
	}

	/**
	 * Sanitize a tool name to match Claude API pattern: ^[a-zA-Z0-9_-]{1,128}$
	 * Replaces disallowed characters (e.g. dots) with underscores.
	 */
	_sanitizeToolName(name) {
		return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)
	}

	/** Resolve a sanitized tool name back to the original MCP tool name */
	getOriginalToolName(sanitizedName) {
		return this._toolNameMap.get(sanitizedName) ?? sanitizedName
	}

	getToolDefinitions() {
		if (this.state !== 'ready') {
			return []
		}
		this._toolNameMap.clear()
		return this.tools.map(tool => {
			const sanitized = this._sanitizeToolName(tool.name)
			if (sanitized !== tool.name) {
				this._toolNameMap.set(sanitized, tool.name)
			}
			return {
				name: `${this.serverName}__${sanitized}`,
				description: tool.description || '',
				input_schema: tool.inputSchema || { type: 'object', properties: {}, required: [] }
			}
		})
	}

	async callTool(toolName, args) {
		if (this.state !== 'ready') {
			throw new Error(`Server "${this.serverName}" is not ready (state: ${this.state})`)
		}
		return this._sdkClient.callTool({ name: toolName, arguments: args || {} })
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

		if (this._sdkClient) {
			try { await this._sdkClient.close() } catch {}
			this._sdkClient = null
		}
		this._sdkTransport = null

		await new Promise(resolve => setTimeout(resolve, delay))
		await this.start()
	}
}
