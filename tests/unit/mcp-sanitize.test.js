import { describe, it, expect, afterAll } from 'vitest'
import { McpClient } from '../../src/mcp/client.js'
import { McpManager } from '../../src/mcp/index.js'

describe('McpClient._sanitizeToolName', () => {
	const client = new McpClient('test', { command: 'echo' })

	it('replaces dots with underscores', () => {
		expect(client._sanitizeToolName('articles.create')).toBe('articles_create')
	})

	it('replaces multiple dots', () => {
		expect(client._sanitizeToolName('a.b.c')).toBe('a_b_c')
	})

	it('replaces spaces and special characters', () => {
		expect(client._sanitizeToolName('my tool!')).toBe('my_tool_')
	})

	it('preserves already clean names', () => {
		expect(client._sanitizeToolName('read_file')).toBe('read_file')
	})

	it('preserves hyphens', () => {
		expect(client._sanitizeToolName('my-tool')).toBe('my-tool')
	})

	it('handles empty string', () => {
		expect(client._sanitizeToolName('')).toBe('')
	})

	it('truncates names longer than 128 characters', () => {
		const longName = 'a'.repeat(200)
		const result = client._sanitizeToolName(longName)
		expect(result.length).toBe(128)
		expect(result).toBe('a'.repeat(128))
	})

	it('replaces non-ASCII characters', () => {
		expect(client._sanitizeToolName('ツール名')).toBe('____')
	})

	it('handles mixed valid and invalid characters', () => {
		expect(client._sanitizeToolName('ns.deeply.nested.tool')).toBe('ns_deeply_nested_tool')
	})
})

describe('McpClient — getToolDefinitions / listTools name consistency', () => {
	let client

	afterAll(async () => {
		if (client) {
			await client.stop()
		}
	})

	it('returns sanitized namespaced names for dotted tools', async () => {
		client = new McpClient('cms', {
			command: 'node',
			args: ['tests/mcp-server-dotted.test.js']
		})
		await client.start()
		expect(client.state).toBe('ready')

		const defs = client.getToolDefinitions()
		const names = defs.map(d => d.name)

		expect(names).toContain('cms__articles_list')
		expect(names).toContain('cms__articles_get')
		expect(names).toContain('cms__articles_create')
		expect(names).toContain('cms__articles_update')
		expect(names).toContain('cms__articles_delete')
		expect(names).toContain('cms__ns_deeply_nested_tool')

		// No dotted names should appear
		for (const name of names) {
			expect(name).toMatch(/^[a-zA-Z0-9_-]+$/)
		}
	})

	it('getToolDefinitions and McpManager.listTools return the same sanitized names', async () => {
		const manager = new McpManager()
		manager.clients.set('cms', client)

		const defNames = manager.getToolDefinitions().map(d => d.name)
		const listNames = manager.listTools().map(t => t.name)

		expect(defNames).toEqual(listNames)
	})

	it('includes input_schema in definitions', () => {
		const defs = client.getToolDefinitions()
		const createDef = defs.find(d => d.name === 'cms__articles_create')
		expect(createDef).toBeTruthy()
		expect(createDef.input_schema).toBeTruthy()
		expect(createDef.input_schema.properties).toHaveProperty('title')
	})
})

describe('McpClient.getOriginalToolName mapping', () => {
	let client

	afterAll(async () => {
		if (client) {
			await client.stop()
		}
	})

	it('maps sanitized name back to original dotted name', async () => {
		client = new McpClient('srv', {
			command: 'node',
			args: ['tests/mcp-server-dotted.test.js']
		})
		await client.start()

		// getToolDefinitions populates _toolNameMap
		client.getToolDefinitions()

		expect(client.getOriginalToolName('articles_create')).toBe('articles.create')
		expect(client.getOriginalToolName('articles_list')).toBe('articles.list')
		expect(client.getOriginalToolName('ns_deeply_nested_tool')).toBe('ns.deeply.nested.tool')
	})

	it('returns same name when no mapping needed', async () => {
		// For a clean tool name that was not sanitized, getOriginalToolName returns the input
		const cleanClient = new McpClient('clean', {
			command: 'node',
			args: ['tests/mcp-server.test.js']
		})
		await cleanClient.start()
		cleanClient.getToolDefinitions()

		expect(cleanClient.getOriginalToolName('echo')).toBe('echo')
		expect(cleanClient.getOriginalToolName('add')).toBe('add')

		await cleanClient.stop()
	})
})

describe('McpManager.executeTool — name resolution for dotted tools', () => {
	let manager

	afterAll(async () => {
		if (manager) {
			await manager.stop()
		}
	})

	it('executes tool using sanitized name, sends original name to MCP server', async () => {
		manager = new McpManager()
		const client = new McpClient('cms', {
			command: 'node',
			args: ['tests/mcp-server-dotted.test.js']
		})
		manager.clients.set('cms', client)
		await client.start()

		// Must call getToolDefinitions to populate _toolNameMap
		manager.getToolDefinitions()

		const result = await manager.executeTool('cms__articles_create', { title: 'Test Article' })
		expect(result.ok).toBe(true)
		expect(result.result).toEqual({ id: 99, title: 'Test Article' })
	})

	it('executes deeply nested dotted tool', async () => {
		const result = await manager.executeTool('cms__ns_deeply_nested_tool', { value: 'hello' })
		expect(result.ok).toBe(true)
		expect(result.result).toBe('nested:hello')
	})

	it('returns error for unknown server', async () => {
		const result = await manager.executeTool('unknown__tool', {})
		expect(result.ok).toBe(false)
		expect(result.error).toMatch(/not found/i)
	})

	it('returns error for invalid tool name format', async () => {
		const result = await manager.executeTool('notool', {})
		expect(result.ok).toBe(false)
		expect(result.error).toMatch(/invalid/i)
	})
})
