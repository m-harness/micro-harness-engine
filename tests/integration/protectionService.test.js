import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createTempDir, removeTempDir, setupTestEnv } from '../helpers/setup.js'

let tempDir
let protectionService
let storeFns

beforeAll(async () => {
	tempDir = createTempDir('mhe-protection-')
	setupTestEnv(tempDir)

	protectionService = await import(
		pathToFileURL(path.resolve('src/protection/service.js')).href
	)

	storeFns = await import(
		pathToFileURL(path.resolve('src/core/store.js')).href
	)
})

afterAll(() => {
	removeTempDir(tempDir)
})

describe('evaluateProtection', () => {
	it('denies .env by default rule', () => {
		const result = protectionService.evaluateProtection({
			action: 'read',
			targetPath: '.env',
			logDecision: false
		})
		expect(result.effect).toBe('deny')
	})

	it('allows unprotected path', () => {
		const result = protectionService.evaluateProtection({
			action: 'read',
			targetPath: 'docs/readme.txt',
			logDecision: false
		})
		expect(result.effect).toBe('allow')
	})

	it('respects priority - lower number wins', () => {
		// Default .env rule has priority 10 (deny).
		// evaluateProtection picks the lowest priority rule.
		const result = protectionService.evaluateProtection({
			action: 'read',
			targetPath: '.env',
			logDecision: false
		})
		expect(result.effect).toBe('deny')
		expect(result.rule).not.toBeNull()
	})
})

describe('assertPathActionAllowed', () => {
	it('passes for allowed path', () => {
		expect(() => {
			protectionService.assertPathActionAllowed('docs/guide.md', 'read', { logDecision: false })
		}).not.toThrow()
	})

	it('throws ProtectionError for denied path', () => {
		expect(() => {
			protectionService.assertPathActionAllowed('.env', 'read', { logDecision: false })
		}).toThrow(/protected/i)
	})
})

describe('filterDiscoverableEntries', () => {
	it('hides protected files and counts them', () => {
		const entries = [
			{ name: '.env', type: 'file' },
			{ name: 'docs', type: 'directory' },
			{ name: '.env.local', type: 'file' }
		]
		const result = protectionService.filterDiscoverableEntries('.', entries)
		expect(result.entries.some(e => e.name === 'docs')).toBe(true)
		expect(result.entries.some(e => e.name === '.env')).toBe(false)
		expect(result.hiddenCount).toBeGreaterThanOrEqual(1)
	})
})

describe('sanitizeMessagesForModel', () => {
	it('redacts secrets in text content', () => {
		const messages = [
			{ role: 'user', content: 'My key is sk-ant-abcdef1234567890' }
		]
		const result = protectionService.sanitizeMessagesForModel(messages)
		expect(result[0].content).toContain('[REDACTED:anthropic_key]')
		expect(result[0].content).not.toContain('sk-ant-abcdef1234567890')
	})

	it('redacts secrets in array content blocks', () => {
		const messages = [
			{
				role: 'assistant',
				content: [
					{ type: 'text', text: 'Token: ghp_xxxxxxxxxxxxxxxxxxxx' }
				]
			}
		]
		const result = protectionService.sanitizeMessagesForModel(messages)
		expect(result[0].content[0].text).toContain('[REDACTED:github_token]')
	})

	it('passes through messages without secrets', () => {
		const messages = [
			{ role: 'user', content: 'Hello, how are you?' }
		]
		const result = protectionService.sanitizeMessagesForModel(messages)
		expect(result[0].content).toBe('Hello, how are you?')
	})
})

describe('sanitizeToolResultForModel', () => {
	it('redacts secrets in tool result objects', () => {
		const result = protectionService.sanitizeToolResultForModel({
			output: 'key is sk-ant-abcdef1234567890'
		})
		expect(result.output).toContain('[REDACTED:anthropic_key]')
	})
})

describe('addProtectionRule / removeProtectionRule', () => {
	it('adds and removes a custom protection rule', () => {
		const rule = protectionService.addProtectionRule({
			pattern: 'custom-secret.txt',
			patternType: 'exact',
			priority: 50,
			note: 'Test custom rule'
		})
		expect(rule.id).toBeTruthy()
		expect(rule.pattern).toBe('custom-secret.txt')

		// Verify it works
		const decision = protectionService.evaluateProtection({
			action: 'read',
			targetPath: 'custom-secret.txt',
			logDecision: false
		})
		expect(decision.effect).toBe('deny')

		// Remove it
		protectionService.removeProtectionRule(rule.id)

		// Verify it no longer blocks
		const after = protectionService.evaluateProtection({
			action: 'read',
			targetPath: 'custom-secret.txt',
			logDecision: false
		})
		expect(after.effect).toBe('allow')
	})
})

describe('enableProtectionRule / disableProtectionRule', () => {
	it('disabling a rule skips it in evaluation', () => {
		const rule = protectionService.addProtectionRule({
			pattern: 'toggle-test.key',
			patternType: 'exact',
			priority: 50
		})

		// Initially blocked
		let decision = protectionService.evaluateProtection({
			action: 'read',
			targetPath: 'toggle-test.key',
			logDecision: false
		})
		expect(decision.effect).toBe('deny')

		// Disable
		protectionService.disableProtectionRule(rule.id)
		decision = protectionService.evaluateProtection({
			action: 'read',
			targetPath: 'toggle-test.key',
			logDecision: false
		})
		expect(decision.effect).toBe('allow')

		// Re-enable
		protectionService.enableProtectionRule(rule.id)
		decision = protectionService.evaluateProtection({
			action: 'read',
			targetPath: 'toggle-test.key',
			logDecision: false
		})
		expect(decision.effect).toBe('deny')

		// Cleanup
		protectionService.removeProtectionRule(rule.id)
	})
})
