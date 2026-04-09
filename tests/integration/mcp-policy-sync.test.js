import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createTempDir, removeTempDir, setupTestEnv } from '../helpers/setup.js'

let tempDir
let PolicyService
let storeFns
let McpClient
let McpManager

const BUILTIN_TOOLS = [
	{ name: 'read_file', description: 'Read a file', riskLevel: 'safe' },
	{ name: 'write_file', description: 'Write a file', riskLevel: 'moderate' },
	{ name: 'execute_command', description: 'Run shell command', riskLevel: 'high' }
]

beforeAll(async () => {
	tempDir = createTempDir('mhe-mcp-policy-')
	setupTestEnv(tempDir)

	const policyMod = await import(
		pathToFileURL(path.resolve('src/core/policyService.js')).href
	)
	PolicyService = policyMod.PolicyService

	storeFns = await import(
		pathToFileURL(path.resolve('src/core/store.js')).href
	)

	const mcpClientMod = await import(
		pathToFileURL(path.resolve('src/mcp/client.js')).href
	)
	McpClient = mcpClientMod.McpClient

	const mcpManagerMod = await import(
		pathToFileURL(path.resolve('src/mcp/index.js')).href
	)
	McpManager = mcpManagerMod.McpManager

	// Ensure auth is initialised (creates root user + default policies)
	const authMod = await import(
		pathToFileURL(path.resolve('src/core/authService.js')).href
	)
	const authService = new authMod.AuthService()
	authService.loginLocalUser({
		loginName: 'root',
		password: process.env.ADMIN_RUNTIME_PASSWORD
	})
})

afterAll(() => {
	removeTempDir(tempDir)
})

describe('syncSystemPolicies — MCP tools included', () => {
	it('includes sanitized MCP tool names in system-all-tools after sync', async () => {
		const mcpManager = new McpManager()
		const client = new McpClient('cms', {
			command: 'node',
			args: ['tests/mcp-server-dotted.test.js']
		})
		mcpManager.clients.set('cms', client)
		await client.start()

		const policyService = new PolicyService({
			getToolCatalog: () => [...BUILTIN_TOOLS, ...mcpManager.listTools()]
		})

		const allToolsPolicy = storeFns.getSystemAllToolsPolicy()
		const tools = storeFns.listToolPolicyTools(allToolsPolicy.id)

		// Builtin tools present
		expect(tools).toContain('read_file')
		expect(tools).toContain('write_file')
		expect(tools).toContain('execute_command')

		// MCP tools present with sanitized names
		expect(tools).toContain('cms__articles_list')
		expect(tools).toContain('cms__articles_create')
		expect(tools).toContain('cms__ns_deeply_nested_tool')

		// No dotted names
		expect(tools).not.toContain('cms__articles.list')
		expect(tools).not.toContain('cms__articles.create')

		await mcpManager.stop()
	})
})

describe('syncSystemPolicies — idempotency', () => {
	it('produces the same result when called twice', async () => {
		const mcpManager = new McpManager()
		const client = new McpClient('idempotent', {
			command: 'node',
			args: ['tests/mcp-server-dotted.test.js']
		})
		mcpManager.clients.set('idempotent', client)
		await client.start()

		const policyService = new PolicyService({
			getToolCatalog: () => [...BUILTIN_TOOLS, ...mcpManager.listTools()]
		})

		const allToolsPolicy = storeFns.getSystemAllToolsPolicy()
		const toolsAfterFirst = storeFns.listToolPolicyTools(allToolsPolicy.id)

		policyService.syncSystemPolicies()
		const toolsAfterSecond = storeFns.listToolPolicyTools(allToolsPolicy.id)

		expect(toolsAfterFirst.sort()).toEqual(toolsAfterSecond.sort())

		await mcpManager.stop()
	})
})

describe('syncSystemPolicies — MCP not connected', () => {
	it('contains only builtin tools when no MCP servers are connected', () => {
		const mcpManager = new McpManager()

		const policyService = new PolicyService({
			getToolCatalog: () => [...BUILTIN_TOOLS, ...mcpManager.listTools()]
		})

		const allToolsPolicy = storeFns.getSystemAllToolsPolicy()
		const tools = storeFns.listToolPolicyTools(allToolsPolicy.id)

		expect(tools).toContain('read_file')
		expect(tools).toContain('write_file')
		expect(tools).toContain('execute_command')
		expect(tools.length).toBe(BUILTIN_TOOLS.length)
	})
})

describe('onServerReady callback', () => {
	it('re-syncs policies when MCP server becomes ready', async () => {
		const mcpManager = new McpManager()

		// Create policyService before MCP connects
		const policyService = new PolicyService({
			getToolCatalog: () => [...BUILTIN_TOOLS, ...mcpManager.listTools()]
		})

		// Wire up the callback (same pattern as app.js constructor)
		mcpManager.onServerReady = () => {
			policyService.syncSystemPolicies()
		}

		const allToolsPolicy = storeFns.getSystemAllToolsPolicy()
		const toolsBefore = storeFns.listToolPolicyTools(allToolsPolicy.id)
		expect(toolsBefore.length).toBe(BUILTIN_TOOLS.length)

		// Now connect a server — the callback should fire
		const client = new McpClient('delayed', {
			command: 'node',
			args: ['tests/mcp-server-dotted.test.js']
		})
		mcpManager.clients.set('delayed', client)
		await client.start()

		// Manually trigger callback (simulating what McpManager.start/addServer does)
		if (client.state === 'ready' && mcpManager.onServerReady) {
			mcpManager.onServerReady('delayed')
		}

		const toolsAfter = storeFns.listToolPolicyTools(allToolsPolicy.id)
		expect(toolsAfter.length).toBeGreaterThan(BUILTIN_TOOLS.length)
		expect(toolsAfter).toContain('delayed__articles_create')

		await mcpManager.stop()
	})
})

describe('normalizeToolNames — MCP tool name sanitization', () => {
	it('auto-sanitizes dotted MCP tool names to underscores', () => {
		const policyService = new PolicyService({
			getToolCatalog: () => [
				...BUILTIN_TOOLS,
				{ name: 'srv__articles_create', description: 'Create', riskLevel: 'safe' }
			]
		})

		// createToolPolicy internally calls normalizeToolNames
		const policy = policyService.createToolPolicy({
			name: 'Dotted Input Test',
			tools: ['read_file', 'srv__articles.create']
		})

		// The dotted version should have been sanitized to underscore version
		expect(policy.tools).toContain('srv__articles_create')
		expect(policy.tools).not.toContain('srv__articles.create')
		expect(policy.tools).toContain('read_file')
	})

	it('passes through already sanitized names unchanged', () => {
		const policyService = new PolicyService({
			getToolCatalog: () => [
				...BUILTIN_TOOLS,
				{ name: 'srv__articles_create', description: 'Create', riskLevel: 'safe' }
			]
		})

		const policy = policyService.createToolPolicy({
			name: 'Clean Input Test',
			tools: ['srv__articles_create', 'read_file']
		})

		expect(policy.tools).toContain('srv__articles_create')
		expect(policy.tools).toContain('read_file')
	})

	it('deduplicates after sanitization', () => {
		const policyService = new PolicyService({
			getToolCatalog: () => [
				...BUILTIN_TOOLS,
				{ name: 'srv__a_b', description: 'Tool', riskLevel: 'safe' }
			]
		})

		// Both 'srv__a.b' and 'srv__a_b' should resolve to the same sanitized name
		const policy = policyService.createToolPolicy({
			name: 'Dedup Test',
			tools: ['srv__a.b', 'srv__a_b']
		})

		const count = policy.tools.filter(t => t === 'srv__a_b').length
		expect(count).toBe(1)
	})
})

describe('listAllowedToolDefinitions — filtering', () => {
	let mcpManager
	let policyService

	afterAll(async () => {
		if (mcpManager) {
			await mcpManager.stop()
		}
	})

	beforeAll(async () => {
		mcpManager = new McpManager()
		const client = new McpClient('blog', {
			command: 'node',
			args: ['tests/mcp-server-dotted.test.js']
		})
		mcpManager.clients.set('blog', client)
		await client.start()

		policyService = new PolicyService({
			getToolCatalog: () => [...BUILTIN_TOOLS, ...mcpManager.listTools()]
		})
	})

	it('passes MCP tools when present in policy', () => {
		// Get root user
		const users = storeFns.listUsers()
		const rootUser = users.find(u => u.loginName === 'root')

		const allDefs = [...BUILTIN_TOOLS.map(t => ({ name: t.name, description: t.description })), ...mcpManager.getToolDefinitions()]
		const allowed = policyService.listAllowedToolDefinitions(rootUser.id, allDefs)
		const allowedNames = allowed.map(d => d.name)

		// MCP tools should pass through
		expect(allowedNames).toContain('blog__articles_create')
		expect(allowedNames).toContain('blog__ns_deeply_nested_tool')
		// Builtin tools too
		expect(allowedNames).toContain('read_file')
	})

	it('filters out tools not in policy', () => {
		const users = storeFns.listUsers()
		const rootUser = users.find(u => u.loginName === 'root')

		// Create a restricted policy with only read_file
		const restrictedPolicy = policyService.createToolPolicy({
			name: 'Restricted',
			tools: ['read_file']
		})

		const defaultFilePolicy = storeFns.getDefaultFilePolicy()
		policyService.assignPoliciesToUser(rootUser.id, {
			toolPolicyId: restrictedPolicy.id,
			filePolicyId: defaultFilePolicy.id
		})

		const allDefs = [...BUILTIN_TOOLS.map(t => ({ name: t.name, description: t.description })), ...mcpManager.getToolDefinitions()]
		const allowed = policyService.listAllowedToolDefinitions(rootUser.id, allDefs)
		const allowedNames = allowed.map(d => d.name)

		expect(allowedNames).toContain('read_file')
		expect(allowedNames).not.toContain('blog__articles_create')
		expect(allowedNames).not.toContain('write_file')

		// Restore system-all-tools
		const allToolsPolicy = storeFns.getSystemAllToolsPolicy()
		policyService.assignPoliciesToUser(rootUser.id, {
			toolPolicyId: allToolsPolicy.id,
			filePolicyId: defaultFilePolicy.id
		})
	})

	it('dotted-name policy matches sanitized definitions (normalizeToolNames effect)', () => {
		const users = storeFns.listUsers()
		const rootUser = users.find(u => u.loginName === 'root')

		// Create policy using dotted form — normalizeToolNames should fix it
		const policy = policyService.createToolPolicy({
			name: 'Dotted Match Test',
			tools: ['read_file', 'blog__articles.create', 'blog__articles.list']
		})

		const defaultFilePolicy = storeFns.getDefaultFilePolicy()
		policyService.assignPoliciesToUser(rootUser.id, {
			toolPolicyId: policy.id,
			filePolicyId: defaultFilePolicy.id
		})

		const allDefs = [...BUILTIN_TOOLS.map(t => ({ name: t.name, description: t.description })), ...mcpManager.getToolDefinitions()]
		const allowed = policyService.listAllowedToolDefinitions(rootUser.id, allDefs)
		const allowedNames = allowed.map(d => d.name)

		// These should match because normalizeToolNames converts dots to underscores
		expect(allowedNames).toContain('blog__articles_create')
		expect(allowedNames).toContain('blog__articles_list')
		expect(allowedNames).toContain('read_file')
		expect(allowedNames).not.toContain('blog__articles_delete')

		// Restore system-all-tools
		const allToolsPolicy = storeFns.getSystemAllToolsPolicy()
		policyService.assignPoliciesToUser(rootUser.id, {
			toolPolicyId: allToolsPolicy.id,
			filePolicyId: defaultFilePolicy.id
		})
	})

	it('mixed builtin + MCP policy passes both correctly', () => {
		const users = storeFns.listUsers()
		const rootUser = users.find(u => u.loginName === 'root')

		const policy = policyService.createToolPolicy({
			name: 'Mixed Policy',
			tools: ['read_file', 'write_file', 'blog__articles_create', 'blog__articles_get']
		})

		const defaultFilePolicy = storeFns.getDefaultFilePolicy()
		policyService.assignPoliciesToUser(rootUser.id, {
			toolPolicyId: policy.id,
			filePolicyId: defaultFilePolicy.id
		})

		const allDefs = [...BUILTIN_TOOLS.map(t => ({ name: t.name, description: t.description })), ...mcpManager.getToolDefinitions()]
		const allowed = policyService.listAllowedToolDefinitions(rootUser.id, allDefs)
		const allowedNames = allowed.map(d => d.name)

		expect(allowedNames).toContain('read_file')
		expect(allowedNames).toContain('write_file')
		expect(allowedNames).toContain('blog__articles_create')
		expect(allowedNames).toContain('blog__articles_get')
		expect(allowedNames).not.toContain('execute_command')
		expect(allowedNames).not.toContain('blog__articles_delete')

		// Restore
		const allToolsPolicy = storeFns.getSystemAllToolsPolicy()
		policyService.assignPoliciesToUser(rootUser.id, {
			toolPolicyId: allToolsPolicy.id,
			filePolicyId: defaultFilePolicy.id
		})
	})
})

describe('tool name collision edge case', () => {
	it('a.b and a_b produce the same sanitized name — deduplication', () => {
		const mcpManager = new McpManager()

		// Simulate a server that has both 'a.b' and 'a_b' as tools
		const client = new McpClient('collision', { command: 'echo' })
		client.state = 'ready'
		client.tools = [
			{ name: 'a.b', description: 'Dotted', inputSchema: { type: 'object', properties: {}, required: [] } },
			{ name: 'a_b', description: 'Underscored', inputSchema: { type: 'object', properties: {}, required: [] } }
		]
		mcpManager.clients.set('collision', client)

		const defs = mcpManager.getToolDefinitions()
		const names = defs.map(d => d.name)

		// Both sanitize to collision__a_b
		const uniqueNames = [...new Set(names)]

		// Both map to the same sanitized name so they both appear (getToolDefinitions doesn't dedup)
		// But normalizeToolNames in policy will dedup
		expect(names.filter(n => n === 'collision__a_b').length).toBe(2)
		expect(uniqueNames.length).toBe(1)
	})

	it('normalizeToolNames deduplicates collision names', () => {
		const policyService = new PolicyService({
			getToolCatalog: () => [
				...BUILTIN_TOOLS,
				{ name: 'srv__a_b', description: 'Tool', riskLevel: 'safe' }
			]
		})

		const policy = policyService.createToolPolicy({
			name: 'Collision Dedup',
			tools: ['srv__a.b', 'srv__a_b', 'read_file']
		})

		// Should only have one instance of srv__a_b
		expect(policy.tools.filter(t => t === 'srv__a_b').length).toBe(1)
		expect(policy.tools).toContain('read_file')
	})
})
