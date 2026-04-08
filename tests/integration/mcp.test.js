import { describe, it, expect, afterAll } from 'vitest'
import { McpClient } from '../../src/mcp/client.js'
import { McpManager } from '../../src/mcp/index.js'

describe('McpClient', () => {
	let client

	afterAll(async () => {
		if (client) {
			await client.stop()
		}
	})

	it('connects to stdio server and discovers tools', async () => {
		client = new McpClient('local-test', {
			command: 'node',
			args: ['tests/mcp-server.test.js']
		})
		await client.start()

		expect(client.state).toBe('ready')
		const toolNames = client.tools.map(t => t.name)
		expect(toolNames).toContain('echo')
		expect(toolNames).toContain('add')
		expect(toolNames).toContain('now')
	})

	it('returns namespaced tool definitions', () => {
		const defs = client.getToolDefinitions()
		const names = defs.map(d => d.name)
		expect(names).toContain('local-test__echo')
		expect(names).toContain('local-test__add')
		expect(names).toContain('local-test__now')

		const echoDef = defs.find(d => d.name === 'local-test__echo')
		expect(echoDef.input_schema).toBeTruthy()
		expect(echoDef.description).toBeTruthy()
	})

	it('executes echo tool', async () => {
		const result = await client.callTool('echo', { message: 'Hello from vitest' })
		expect(result.content).toEqual([
			{ type: 'text', text: 'Hello from vitest' }
		])
	})

	it('executes add tool', async () => {
		const result = await client.callTool('add', { a: 100, b: 200 })
		expect(result.content[0].text).toBe('300')
	})

	it('executes now tool', async () => {
		const result = await client.callTool('now', {})
		const text = result.content[0].text
		expect(() => new Date(text)).not.toThrow()
		expect(new Date(text).getFullYear()).toBeGreaterThanOrEqual(2024)
	})

	it('returns empty definitions when not ready', async () => {
		const disconnected = new McpClient('off', { command: 'echo' })
		expect(disconnected.getToolDefinitions()).toEqual([])
	})
})

describe('McpManager', () => {
	let manager

	afterAll(async () => {
		if (manager) {
			await manager.stop()
		}
	})

	it('registers tools from connected servers', async () => {
		manager = new McpManager()
		const client = new McpClient('testsvr', {
			command: 'node',
			args: ['tests/mcp-server.test.js']
		})
		manager.clients.set('testsvr', client)
		await client.start()

		const defs = manager.getToolDefinitions()
		expect(defs.length).toBe(3)
		expect(defs.map(d => d.name)).toContain('testsvr__echo')
	})

	it('isMcpTool identifies namespaced names', () => {
		expect(manager.isMcpTool('testsvr__echo')).toBe(true)
		expect(manager.isMcpTool('read_file')).toBe(false)
	})

	it('executeTool routes to correct server', async () => {
		const result = await manager.executeTool('testsvr__echo', { message: 'manager test' })
		expect(result.ok).toBe(true)
		expect(result.result).toBe('manager test')
	})

	it('executeTool normalizes add result', async () => {
		const result = await manager.executeTool('testsvr__add', { a: 7, b: 3 })
		expect(result.ok).toBe(true)
		expect(result.result).toBe(10)
	})

	it('executeTool returns error for unknown server', async () => {
		const result = await manager.executeTool('unknown__tool', {})
		expect(result.ok).toBe(false)
		expect(result.error).toMatch(/not found/i)
	})

	it('listTools returns catalog with metadata', () => {
		const catalog = manager.listTools()
		expect(catalog.length).toBe(3)
		expect(catalog[0].source).toBe('mcp')
		expect(catalog[0].mcpServerName).toBe('testsvr')
	})

	it('getConnectedServerNames lists ready servers', () => {
		const names = manager.getConnectedServerNames()
		expect(names).toContain('testsvr')
	})

	it('getServerStatuses returns state info', () => {
		const statuses = manager.getServerStatuses()
		expect(statuses.length).toBe(1)
		expect(statuses[0].name).toBe('testsvr')
		expect(statuses[0].state).toBe('ready')
		expect(statuses[0].toolCount).toBe(3)
	})
})
