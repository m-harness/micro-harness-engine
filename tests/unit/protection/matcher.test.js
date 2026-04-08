import { describe, it, expect } from 'vitest'
import {
	normalizeProtectionPath,
	matchesProtectionRule,
	compareRulePriority
} from '../../../src/protection/matcher.js'

describe('normalizeProtectionPath', () => {
	it('normalizes relative path with ./', () => {
		expect(normalizeProtectionPath('./foo/bar')).toBe('foo/bar')
	})

	it('normalizes backslashes to forward slashes', () => {
		expect(normalizeProtectionPath('foo\\bar')).toBe('foo/bar')
	})

	it('returns empty string for parent directory escape', () => {
		expect(normalizeProtectionPath('../../etc')).toBe('')
	})

	it('returns empty string for bare ..', () => {
		expect(normalizeProtectionPath('..')).toBe('')
	})

	it('returns . for dot-only input', () => {
		expect(normalizeProtectionPath('.')).toBe('.')
	})

	it('returns . for undefined/null', () => {
		expect(normalizeProtectionPath(undefined)).toBe('.')
		expect(normalizeProtectionPath(null)).toBe('.')
	})

	it('normalizes absolute path slashes', () => {
		const result = normalizeProtectionPath('/foo/bar')
		expect(result).toMatch(/foo\/bar/)
		expect(result).not.toMatch(/\\/)
	})

	it('normalizes simple relative paths', () => {
		expect(normalizeProtectionPath('src/index.js')).toBe('src/index.js')
	})
})

describe('matchesProtectionRule', () => {
	it('exact: matches identical path', () => {
		const rule = { pattern: '.env', patternType: 'exact' }
		expect(matchesProtectionRule(rule, '.env')).toBe(true)
	})

	it('exact: does not match different path', () => {
		const rule = { pattern: '.env', patternType: 'exact' }
		expect(matchesProtectionRule(rule, '.env.local')).toBe(false)
	})

	it('exact: case-insensitive match', () => {
		const rule = { pattern: '.env', patternType: 'exact' }
		expect(matchesProtectionRule(rule, '.ENV')).toBe(true)
	})

	it('dirname: matches exact directory name', () => {
		const rule = { pattern: 'security', patternType: 'dirname' }
		expect(matchesProtectionRule(rule, 'security')).toBe(true)
	})

	it('dirname: matches child paths', () => {
		const rule = { pattern: 'security', patternType: 'dirname' }
		expect(matchesProtectionRule(rule, 'security/keys/id_rsa')).toBe(true)
	})

	it('dirname: does not match partial prefix', () => {
		const rule = { pattern: 'security', patternType: 'dirname' }
		expect(matchesProtectionRule(rule, 'security-backup')).toBe(false)
	})

	it('glob: single wildcard matches within directory', () => {
		const rule = { pattern: '.env.*', patternType: 'glob' }
		expect(matchesProtectionRule(rule, '.env.local')).toBe(true)
	})

	it('glob: recursive wildcard matches nested paths', () => {
		const rule = { pattern: '**/credentials.json', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'config/credentials.json')).toBe(true)
	})

	it('glob: single wildcard does not cross directories', () => {
		const rule = { pattern: '*.key', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'foo/bar.key')).toBe(false)
	})

	it('returns false for empty/escaped path', () => {
		const rule = { pattern: '.env', patternType: 'exact' }
		expect(matchesProtectionRule(rule, '../../etc/passwd')).toBe(false)
	})
})

describe('matchesProtectionRule - ReDoS prevention (M-6)', () => {
	it('rejects glob patterns exceeding 500 characters', () => {
		const longPattern = '*'.repeat(501)
		const rule = { pattern: longPattern, patternType: 'glob' }
		// Should return false instead of throwing (try-catch wraps globToRegExp)
		expect(matchesProtectionRule(rule, 'test.txt')).toBe(false)
	})

	it('rejects glob patterns with 3+ consecutive wildcards', () => {
		const rule = { pattern: '***.txt', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'test.txt')).toBe(false)
	})

	it('accepts patterns with exactly 2 consecutive wildcards', () => {
		const rule = { pattern: '**/*.txt', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'dir/test.txt')).toBe(true)
	})

	it('accepts patterns within length limit', () => {
		const pattern = 'a'.repeat(499) + '*'
		const rule = { pattern, patternType: 'glob' }
		// Should not throw
		expect(() => matchesProtectionRule(rule, 'test')).not.toThrow()
	})
})

describe('compareRulePriority', () => {
	it('sorts by different priority values', () => {
		const low = { priority: 10, id: 2 }
		const high = { priority: 100, id: 1 }
		expect(compareRulePriority(low, high)).toBeLessThan(0)
		expect(compareRulePriority(high, low)).toBeGreaterThan(0)
	})

	it('falls back to id when priority is equal', () => {
		const first = { priority: 50, id: 1 }
		const second = { priority: 50, id: 5 }
		expect(compareRulePriority(first, second)).toBeLessThan(0)
		expect(compareRulePriority(second, first)).toBeGreaterThan(0)
	})

	it('returns 0 for identical priority and id', () => {
		const rule = { priority: 50, id: 3 }
		expect(compareRulePriority(rule, rule)).toBe(0)
	})
})
