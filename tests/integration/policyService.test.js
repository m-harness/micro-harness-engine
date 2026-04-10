import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createTempDir, removeTempDir, setupTestEnv } from '../helpers/setup.js'

let tempDir
let PolicyService
let AuthService
let storeFns

const TOOL_CATALOG = [
	{ name: 'read_file', description: 'Read a file', riskLevel: 'safe' },
	{ name: 'write_file', description: 'Write a file', riskLevel: 'moderate' },
	{ name: 'execute_command', description: 'Run shell command', riskLevel: 'high' },
	{ name: 'list_directory', description: 'List directory', riskLevel: 'safe' }
]

beforeAll(async () => {
	tempDir = createTempDir('mhe-policy-')
	setupTestEnv(tempDir)

	const policyMod = await import(
		pathToFileURL(path.resolve('src/core/policyService.js')).href
	)
	PolicyService = policyMod.PolicyService

	const authMod = await import(
		pathToFileURL(path.resolve('src/core/authService.js')).href
	)
	AuthService = authMod.AuthService

	storeFns = await import(
		pathToFileURL(path.resolve('src/core/store.js')).href
	)
})

afterAll(() => {
	removeTempDir(tempDir)
})

describe('PolicyService', () => {
	let policyService
	let authService
	let rootUserId

	beforeAll(() => {
		policyService = new PolicyService({
			getToolCatalog: () => TOOL_CATALOG
		})
		authService = new AuthService()

		const login = authService.loginLocalUser({
			loginName: 'root',
			password: process.env.ADMIN_RUNTIME_PASSWORD
		})
		rootUserId = login.user.id
	})

	describe('syncSystemPolicies', () => {
		it('registers all tools in System All Tools policy', () => {
			policyService.syncSystemPolicies()
			const allToolsPolicy = storeFns.getSystemAllToolsPolicy()
			const tools = storeFns.listToolPolicyTools(allToolsPolicy.id)
			for (const tool of TOOL_CATALOG) {
				expect(tools).toContain(tool.name)
			}
		})
	})

	describe('Tool Policy CRUD', () => {
		it('creates a custom tool policy', () => {
			const policy = policyService.createToolPolicy({
				name: 'Read Only',
				description: 'Only read operations',
				tools: ['read_file', 'list_directory']
			})
			expect(policy.name).toBe('Read Only')
			expect(policy.tools).toContain('read_file')
			expect(policy.tools).toContain('list_directory')
			expect(policy.tools).not.toContain('write_file')
		})

		it('updates a custom tool policy', () => {
			const policy = policyService.createToolPolicy({
				name: 'Updatable',
				tools: ['read_file']
			})
			const updated = policyService.updateToolPolicyRecord(policy.id, {
				name: 'Updated Policy',
				tools: ['read_file', 'write_file']
			})
			expect(updated.name).toBe('Updated Policy')
			expect(updated.tools).toContain('write_file')
		})

		it('rejects editing system tool policy', () => {
			const allToolsPolicy = storeFns.getSystemAllToolsPolicy()
			expect(() => {
				policyService.updateToolPolicyRecord(allToolsPolicy.id, {
					name: 'Hacked',
					tools: []
				})
			}).toThrow(/400|System/i)
		})

		it('deletes unassigned custom tool policy', () => {
			const policy = policyService.createToolPolicy({
				name: 'Delete Me',
				tools: ['read_file']
			})
			const result = policyService.deleteToolPolicy(policy.id)
			expect(result.deletedPolicyId).toBe(policy.id)
		})

		it('deletes assigned policy with replacement', () => {
			const p1 = policyService.createToolPolicy({
				name: 'Source Policy',
				tools: ['read_file']
			})
			const p2 = policyService.createToolPolicy({
				name: 'Replacement Policy',
				tools: ['read_file', 'write_file']
			})
			policyService.assignPoliciesToUser(rootUserId, {
				toolPolicyId: p1.id,
				filePolicyId: storeFns.getDefaultFilePolicy().id
			})
			const result = policyService.deleteToolPolicy(p1.id, p2.id)
			expect(result.replacementPolicyId).toBe(p2.id)
		})

		it('rejects deleting assigned policy without replacement', () => {
			const policy = policyService.createToolPolicy({
				name: 'No Replacement',
				tools: ['read_file']
			})
			policyService.assignPoliciesToUser(rootUserId, {
				toolPolicyId: policy.id,
				filePolicyId: storeFns.getDefaultFilePolicy().id
			})
			expect(() => {
				policyService.deleteToolPolicy(policy.id)
			}).toThrow(/400|replacement/i)
		})

		it('rejects deleting system tool policy', () => {
			const allToolsPolicy = storeFns.getSystemAllToolsPolicy()
			expect(() => {
				policyService.deleteToolPolicy(allToolsPolicy.id)
			}).toThrow(/400|System/i)
		})

		it('rejects creating policy with unknown tools', () => {
			expect(() => {
				policyService.createToolPolicy({
					name: 'Bad Create',
					tools: ['read_file', 'nonexistent_tool']
				})
			}).toThrow(/400|Unknown/i)
		})

		it('preserves orphaned tools on update (no validation error)', () => {
			const policy = policyService.createToolPolicy({
				name: 'Orphan Test',
				tools: ['read_file']
			})
			// Simulate orphaned tool by directly inserting into DB
			storeFns.replaceToolPolicyTools(policy.id, ['read_file', 'deleted-mcp__search'])

			// Update with the same tools — orphaned tool should be kept, not rejected
			const updated = policyService.updateToolPolicyRecord(policy.id, {
				name: 'Orphan Test Updated',
				tools: ['read_file', 'deleted-mcp__search']
			})
			expect(updated.tools).toContain('read_file')
			expect(updated.tools).toContain('deleted-mcp__search')
		})

		it('removes only unchecked orphaned tools on update', () => {
			const policy = policyService.createToolPolicy({
				name: 'Orphan Partial',
				tools: ['read_file']
			})
			storeFns.replaceToolPolicyTools(policy.id, [
				'read_file', 'deleted-mcp__tool_a', 'deleted-mcp__tool_b'
			])

			// User unchecks tool_b but keeps tool_a
			const updated = policyService.updateToolPolicyRecord(policy.id, {
				tools: ['read_file', 'deleted-mcp__tool_a']
			})
			expect(updated.tools).toContain('read_file')
			expect(updated.tools).toContain('deleted-mcp__tool_a')
			expect(updated.tools).not.toContain('deleted-mcp__tool_b')
		})

		it('orphaned tools are excluded from listAllowedToolDefinitions', () => {
			const policy = policyService.createToolPolicy({
				name: 'Orphan Runtime',
				tools: ['read_file']
			})
			storeFns.replaceToolPolicyTools(policy.id, ['read_file', 'deleted-mcp__ghost'])
			const user = authService.createLocalUser({
				loginName: 'orphanuser',
				password: 'LongPassword12!',
				displayName: 'Orphan User'
			})
			policyService.assignPoliciesToUser(user.id, {
				toolPolicyId: policy.id,
				filePolicyId: storeFns.getDefaultFilePolicy().id
			})

			const defs = policyService.listAllowedToolDefinitions(user.id, TOOL_CATALOG)
			expect(defs).toHaveLength(1)
			expect(defs[0].name).toBe('read_file')
		})
	})

	describe('File Policy CRUD', () => {
		it('creates a file policy', () => {
			const policy = policyService.createFilePolicy({
				name: 'Custom Dirs',
				description: 'Custom directory access'
			})
			expect(policy.name).toBe('Custom Dirs')
			expect(policy.roots).toEqual([])
		})

		it('adds workspace root to file policy', () => {
			const policy = policyService.createFilePolicy({
				name: 'With Root'
			})
			const root = policyService.addRootToFilePolicy(policy.id, {
				scope: 'workspace',
				rootPath: 'src',
				pathType: 'dir'
			})
			expect(root.scope).toBe('workspace')
			expect(root.pathType).toBe('dir')
		})

		it('rejects adding root to system policy', () => {
			const defaultPolicy = storeFns.getDefaultFilePolicy()
			expect(() => {
				policyService.addRootToFilePolicy(defaultPolicy.id, {
					scope: 'workspace',
					rootPath: 'test',
					pathType: 'dir'
				})
			}).toThrow(/400|System/i)
		})

		it('rejects invalid scope', () => {
			const policy = policyService.createFilePolicy({
				name: 'Bad Scope'
			})
			expect(() => {
				policyService.addRootToFilePolicy(policy.id, {
					scope: 'invalid',
					rootPath: 'test',
					pathType: 'dir'
				})
			}).toThrow(/400|scope/i)
		})

		it('rejects invalid pathType', () => {
			const policy = policyService.createFilePolicy({
				name: 'Bad PathType'
			})
			expect(() => {
				policyService.addRootToFilePolicy(policy.id, {
					scope: 'workspace',
					rootPath: 'test',
					pathType: 'symlink'
				})
			}).toThrow(/400|pathType/i)
		})

		it('deletes file policy with replacement', () => {
			const p1 = policyService.createFilePolicy({ name: 'FP Source' })
			const p2 = policyService.createFilePolicy({ name: 'FP Replacement' })
			policyService.assignPoliciesToUser(rootUserId, {
				toolPolicyId: storeFns.getDefaultToolPolicy().id,
				filePolicyId: p1.id
			})
			const result = policyService.deleteFilePolicy(p1.id, p2.id)
			expect(result.replacementPolicyId).toBe(p2.id)
		})
	})

	describe('assertToolAllowed', () => {
		it('allows permitted tool', () => {
			const policy = policyService.createToolPolicy({
				name: 'Assert Test',
				tools: ['read_file', 'list_directory']
			})
			const user = authService.createLocalUser({
				loginName: 'tooluser',
				password: 'LongPassword12!',
				displayName: 'Tool User'
			})
			policyService.assignPoliciesToUser(user.id, {
				toolPolicyId: policy.id,
				filePolicyId: storeFns.getDefaultFilePolicy().id
			})
			expect(() => policyService.assertToolAllowed(user.id, 'read_file')).not.toThrow()
		})

		it('rejects non-permitted tool with 403', () => {
			const policy = policyService.createToolPolicy({
				name: 'Assert Deny',
				tools: ['read_file']
			})
			const user = authService.createLocalUser({
				loginName: 'tooluser2',
				password: 'LongPassword12!',
				displayName: 'Tool User 2'
			})
			policyService.assignPoliciesToUser(user.id, {
				toolPolicyId: policy.id,
				filePolicyId: storeFns.getDefaultFilePolicy().id
			})
			expect(() => policyService.assertToolAllowed(user.id, 'execute_command')).toThrow(/403|not permitted/i)
		})
	})

	describe('listAllowedToolDefinitions', () => {
		it('filters tool definitions', () => {
			const policy = policyService.createToolPolicy({
				name: 'Filter Test',
				tools: ['read_file']
			})
			const user = authService.createLocalUser({
				loginName: 'filteruser',
				password: 'LongPassword12!',
				displayName: 'Filter User'
			})
			policyService.assignPoliciesToUser(user.id, {
				toolPolicyId: policy.id,
				filePolicyId: storeFns.getDefaultFilePolicy().id
			})
			const defs = policyService.listAllowedToolDefinitions(user.id, TOOL_CATALOG)
			expect(defs).toHaveLength(1)
			expect(defs[0].name).toBe('read_file')
		})
	})

	describe('resolveFileAccess', () => {
		it('allows workspace path for default policy', () => {
			const result = policyService.resolveFileAccess(rootUserId, 'src/index.js')
			expect(result.absolutePath).toBeTruthy()
			expect(result.displayPath.replace(/\\/g, '/')).toBe('src/index.js')
		})

		it('rejects path outside workspace with 403', () => {
			expect(() => {
				policyService.resolveFileAccess(rootUserId, '/etc/passwd')
			}).toThrow(/403|outside/i)
		})

		it('allows external path with absolute root in custom policy', () => {
			const externalDir = createTempDir('mhe-ext-')
			try {
				const policy = policyService.createFilePolicy({
					name: 'External Access'
				})
				policyService.addRootToFilePolicy(policy.id, {
					scope: 'absolute',
					rootPath: externalDir,
					pathType: 'dir'
				})
				const user = authService.createLocalUser({
					loginName: 'extuser',
					password: 'LongPassword12!',
					displayName: 'Ext User'
				})
				policyService.assignPoliciesToUser(user.id, {
					toolPolicyId: storeFns.getDefaultToolPolicy().id,
					filePolicyId: policy.id
				})
				const result = policyService.resolveFileAccess(user.id, externalDir)
				expect(result.absolutePath).toBeTruthy()
			} finally {
				removeTempDir(externalDir)
			}
		})

		it('ensures workspace access even with custom policy', () => {
			const policy = policyService.createFilePolicy({
				name: 'Workspace Guarantee'
			})
			const user = authService.createLocalUser({
				loginName: 'wsuser',
				password: 'LongPassword12!',
				displayName: 'WS User'
			})
			policyService.assignPoliciesToUser(user.id, {
				toolPolicyId: storeFns.getDefaultToolPolicy().id,
				filePolicyId: policy.id
			})
			const result = policyService.resolveFileAccess(user.id, '.')
			expect(result.displayPath).toBe('.')
		})
	})

	describe('probePath', () => {
		it('probes existing workspace directory', () => {
			const result = policyService.probePath('.')
			expect(result.exists).toBe(true)
			expect(result.isWorkspace).toBe(true)
			expect(result.pathType).toBe('dir')
		})

		it('probes non-existent path', () => {
			const result = policyService.probePath('nonexistent/path/here')
			expect(result.exists).toBe(false)
		})

		it('rejects empty path', () => {
			expect(() => policyService.probePath('')).toThrow(/400|required/i)
		})
	})
})
