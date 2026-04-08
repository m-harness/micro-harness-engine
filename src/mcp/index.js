/**
 * McpManager — orchestrates all MCP server connections.
 * Provides unified tool definitions and execution routing.
 */

import { McpClient } from './client.js'
import { loadMcpConfig } from './config.js'

export class McpManager {
	constructor() {
		this.clients = new Map()
		this.onServerReady = null
	}

	start() {
		const config = loadMcpConfig()
		if (config.size === 0) {
			return
		}

		for (const [name, serverConfig] of config.entries()) {
			const client = new McpClient(name, serverConfig)
			this.clients.set(name, client)
			client.start()
				.then(() => {
					if (client.state === 'ready' && this.onServerReady) {
						this.onServerReady(name)
					}
				})
				.catch(err => {
					console.error(`[mcp] Server "${name}" start failed:`, err.message)
				})
		}
	}

	async stop() {
		const stops = [...this.clients.values()].map(client => client.stop())
		await Promise.allSettled(stops)
		this.clients.clear()
	}

	addServer(name, config) {
		if (this.clients.has(name)) {
			throw new Error(`MCP server "${name}" already exists.`)
		}
		const client = new McpClient(name, config)
		this.clients.set(name, client)
		// Fire-and-forget: don't block the API request
		client.start()
			.then(() => {
				if (client.state === 'ready' && this.onServerReady) {
					this.onServerReady(name)
				}
			})
			.catch(err => {
				console.error(`[mcp] Server "${name}" start failed:`, err.message)
			})
		return this._clientStatus(client)
	}

	async removeServer(name) {
		const client = this.clients.get(name)
		if (!client) {
			throw new Error(`MCP server "${name}" not found.`)
		}
		await client.stop()
		this.clients.delete(name)
	}

	async updateServer(name, config) {
		const existing = this.clients.get(name)
		if (existing) {
			await existing.stop()
			this.clients.delete(name)
		}
		return this.addServer(name, config)
	}

	_clientStatus(client) {
		return {
			name: client.serverName,
			state: client.state,
			toolCount: client.tools.length,
			lastError: client.lastError || null
		}
	}

	getToolDefinitions() {
		const definitions = []
		for (const client of this.clients.values()) {
			if (client.state === 'ready') {
				definitions.push(...client.getToolDefinitions())
			}
		}
		return definitions
	}

	isMcpTool(name) {
		return typeof name === 'string' && name.includes('__')
	}

	async executeTool(namespacedName, input) {
		const separatorIndex = namespacedName.indexOf('__')
		if (separatorIndex === -1) {
			return { ok: false, error: `Invalid MCP tool name: ${namespacedName}` }
		}

		const serverName = namespacedName.slice(0, separatorIndex)
		const toolName = namespacedName.slice(separatorIndex + 2)
		const client = this.clients.get(serverName)

		if (!client) {
			return { ok: false, error: `MCP server "${serverName}" not found` }
		}

		if (client.state !== 'ready') {
			return { ok: false, error: `MCP server "${serverName}" is not ready (state: ${client.state})` }
		}

		try {
			const mcpResult = await client.callTool(toolName, input)
			return this._normalizeToolResult(mcpResult)
		} catch (error) {
			return { ok: false, error: error.message }
		}
	}

	_normalizeToolResult(mcpResult) {
		if (!mcpResult) {
			return { ok: true, result: null }
		}

		const content = mcpResult.content || []

		if (mcpResult.isError) {
			const errorText = content
				.filter(c => c.type === 'text')
				.map(c => c.text)
				.join('\n')
			return { ok: false, error: errorText || 'MCP tool returned an error' }
		}

		// テキスト部分を収集
		const textParts = content.filter(c => c.type === 'text').map(c => c.text)
		// image/resourceなど非テキストコンテンツの要約
		const nonTextParts = content.filter(c => c.type !== 'text')

		let result
		if (textParts.length === 1 && nonTextParts.length === 0) {
			try {
				result = JSON.parse(textParts[0])
			} catch {
				result = textParts[0]
			}
		} else if (textParts.length > 0) {
			result = textParts.join('\n')
		} else if (nonTextParts.length > 0) {
			// テキストがない場合は非テキストコンテンツの情報を返す
			result = nonTextParts.map(c => `[${c.type}${c.mimeType ? ': ' + c.mimeType : ''}]`).join(', ')
		} else {
			result = null
		}

		// 非テキストコンテンツがあれば注記を追加
		if (textParts.length > 0 && nonTextParts.length > 0) {
			const note = nonTextParts.map(c => `[${c.type}${c.mimeType ? ': ' + c.mimeType : ''}]`).join(', ')
			return { ok: true, result, attachments: note }
		}

		return { ok: true, result }
	}

	listTools() {
		const tools = []
		for (const client of this.clients.values()) {
			if (client.state === 'ready') {
				for (const tool of client.tools) {
					tools.push({
						name: `${client.serverName}__${tool.name}`,
						description: tool.description || '',
						inputSchema: tool.inputSchema || { type: 'object', properties: {}, required: [] },
						riskLevel: 'safe',
						source: 'mcp',
						mcpServerName: client.serverName
					})
				}
			}
		}
		return tools
	}

	getServerStatuses() {
		const statuses = []
		for (const client of this.clients.values()) {
			statuses.push({
				name: client.serverName,
				state: client.state,
				toolCount: client.tools.length,
				lastError: client.lastError || null
			})
		}
		return statuses
	}

	getConnectedServerNames() {
		const names = []
		for (const client of this.clients.values()) {
			if (client.state === 'ready') {
				names.push(client.serverName)
			}
		}
		return names
	}
}
