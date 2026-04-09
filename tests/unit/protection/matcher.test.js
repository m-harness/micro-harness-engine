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

// ---------------------------------------------------------------------------
// matchesProtectionRule – exact / dirname (existing)
// ---------------------------------------------------------------------------

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

	it('returns false for empty/escaped path', () => {
		const rule = { pattern: '.env', patternType: 'exact' }
		expect(matchesProtectionRule(rule, '../../etc/passwd')).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// glob: ** (globstar – zero-or-more directories)
// ---------------------------------------------------------------------------

describe('glob: ** globstar patterns', () => {
	const db = { pattern: '**/*.db', patternType: 'glob' }
	const cred = { pattern: '**/credentials.json', patternType: 'glob' }

	it('matches file at project root (zero directories)', () => {
		expect(matchesProtectionRule(db, 'data.db')).toBe(true)
	})

	it('matches file one directory deep', () => {
		expect(matchesProtectionRule(db, 'data/test.db')).toBe(true)
	})

	it('matches file multiple directories deep', () => {
		expect(matchesProtectionRule(db, 'a/b/c/test.db')).toBe(true)
	})

	it('matches deeply nested path', () => {
		expect(matchesProtectionRule(db, 'a/b/c/d/e/f/g/test.db')).toBe(true)
	})

	it('does not match wrong extension', () => {
		expect(matchesProtectionRule(db, 'test.txt')).toBe(false)
	})

	it('does not match extension suffix (.db.bak)', () => {
		expect(matchesProtectionRule(db, 'test.db.bak')).toBe(false)
	})

	it('does not match when dot is missing (testdb)', () => {
		expect(matchesProtectionRule(db, 'testdb')).toBe(false)
	})

	it('**/credentials.json matches at root', () => {
		expect(matchesProtectionRule(cred, 'credentials.json')).toBe(true)
	})

	it('**/credentials.json matches nested', () => {
		expect(matchesProtectionRule(cred, 'a/b/c/credentials.json')).toBe(true)
	})

	it('**/credentials.json does not match partial filename', () => {
		expect(matchesProtectionRule(cred, 'my-credentials.json')).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// glob: * (single-segment wildcard)
// ---------------------------------------------------------------------------

describe('glob: * single wildcard patterns', () => {
	it('matches within same directory', () => {
		const rule = { pattern: '.env.*', patternType: 'glob' }
		expect(matchesProtectionRule(rule, '.env.local')).toBe(true)
	})

	it('.env.* matches .env.production', () => {
		const rule = { pattern: '.env.*', patternType: 'glob' }
		expect(matchesProtectionRule(rule, '.env.production')).toBe(true)
	})

	it('.env.* matches .env.development.local (no slash = single segment)', () => {
		const rule = { pattern: '.env.*', patternType: 'glob' }
		expect(matchesProtectionRule(rule, '.env.development.local')).toBe(true)
	})

	it('.env.* does not match bare .env', () => {
		const rule = { pattern: '.env.*', patternType: 'glob' }
		expect(matchesProtectionRule(rule, '.env')).toBe(false)
	})

	it('.env.* does not match in subdirectory (no ** prefix)', () => {
		const rule = { pattern: '.env.*', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'config/.env.local')).toBe(false)
	})

	it('single wildcard does not cross directories', () => {
		const rule = { pattern: '*.key', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'foo/bar.key')).toBe(false)
	})

	it('single wildcard matches at root', () => {
		const rule = { pattern: '*.key', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'server.key')).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// glob: dotfile handling (dot: true)
// ---------------------------------------------------------------------------

describe('glob: dotfile handling', () => {
	const db = { pattern: '**/*.db', patternType: 'glob' }

	it('matches dotfile at root (.secret.db)', () => {
		expect(matchesProtectionRule(db, '.secret.db')).toBe(true)
	})

	it('matches dotfile in subdirectory', () => {
		expect(matchesProtectionRule(db, 'a/.hidden.db')).toBe(true)
	})

	it('matches dotfile deeply nested', () => {
		expect(matchesProtectionRule(db, 'a/b/c/.secret.db')).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// glob: case insensitivity (nocase: true)
// ---------------------------------------------------------------------------

describe('glob: case-insensitive matching', () => {
	const db = { pattern: '**/*.db', patternType: 'glob' }
	const cred = { pattern: '**/credentials.json', patternType: 'glob' }
	const env = { pattern: '.env.*', patternType: 'glob' }

	it('matches uppercase extension (TEST.DB)', () => {
		expect(matchesProtectionRule(db, 'TEST.DB')).toBe(true)
	})

	it('matches mixed case (App.Db)', () => {
		expect(matchesProtectionRule(db, 'data/App.Db')).toBe(true)
	})

	it('matches CREDENTIALS.JSON', () => {
		expect(matchesProtectionRule(cred, 'CREDENTIALS.JSON')).toBe(true)
	})

	it('matches .ENV.LOCAL', () => {
		expect(matchesProtectionRule(env, '.ENV.LOCAL')).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// glob: brace expansion {a,b}
// ---------------------------------------------------------------------------

describe('glob: brace expansion', () => {
	it('matches first alternative', () => {
		const rule = { pattern: '**/*.{db,sqlite,sqlite3}', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'data/app.db')).toBe(true)
	})

	it('matches second alternative', () => {
		const rule = { pattern: '**/*.{db,sqlite,sqlite3}', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'data/app.sqlite')).toBe(true)
	})

	it('matches third alternative', () => {
		const rule = { pattern: '**/*.{db,sqlite,sqlite3}', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'data/app.sqlite3')).toBe(true)
	})

	it('does not match unlisted extension', () => {
		const rule = { pattern: '**/*.{db,sqlite,sqlite3}', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'data/app.json')).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// glob: character class [abc]
// ---------------------------------------------------------------------------

describe('glob: character classes', () => {
	it('[a-z]* matches lowercase filename', () => {
		const rule = { pattern: '[a-z]*', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'abc')).toBe(true)
	})

	it('[^a]* does not match excluded character', () => {
		const rule = { pattern: '[^a]*', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'a')).toBe(false)
	})

	it('[^a]* matches non-excluded character', () => {
		const rule = { pattern: '[^a]*', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'b')).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// glob: ? single-character wildcard
// ---------------------------------------------------------------------------

describe('glob: ? single-character wildcard', () => {
	it('matches exactly one character', () => {
		const rule = { pattern: 'config?.json', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'config1.json')).toBe(true)
	})

	it('does not match zero characters', () => {
		const rule = { pattern: 'config?.json', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'config.json')).toBe(false)
	})

	it('does not match two characters', () => {
		const rule = { pattern: 'config?.json', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'config12.json')).toBe(false)
	})

	it('does not match path separator', () => {
		const rule = { pattern: 'a?b', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'a/b')).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// Security: path traversal must never match
// ---------------------------------------------------------------------------

describe('glob: path traversal prevention', () => {
	const db = { pattern: '**/*.db', patternType: 'glob' }

	it('rejects ../secret.db', () => {
		expect(matchesProtectionRule(db, '../secret.db')).toBe(false)
	})

	it('rejects ../../data/app.db', () => {
		expect(matchesProtectionRule(db, '../../data/app.db')).toBe(false)
	})

	it('rejects embedded traversal a/../../secret.db', () => {
		expect(matchesProtectionRule(db, 'a/../../secret.db')).toBe(false)
	})

	it('rejects deep traversal for credentials', () => {
		const cred = { pattern: '**/credentials.json', patternType: 'glob' }
		expect(matchesProtectionRule(cred, '../../../etc/credentials.json')).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// Security: ReDoS prevention (M-6)
// ---------------------------------------------------------------------------

describe('matchesProtectionRule - ReDoS prevention (M-6)', () => {
	it('rejects glob patterns exceeding 500 characters', () => {
		const longPattern = '*'.repeat(501)
		const rule = { pattern: longPattern, patternType: 'glob' }
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
		expect(() => matchesProtectionRule(rule, 'test')).not.toThrow()
	})
})

// ---------------------------------------------------------------------------
// Default protection rules – integration smoke tests
// ---------------------------------------------------------------------------

describe('default protection rule patterns', () => {
	it('**/*.db matches root-level db file', () => {
		const rule = { pattern: '**/*.db', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'app.db')).toBe(true)
	})

	it('**/*.db-shm matches root-level shm file', () => {
		const rule = { pattern: '**/*.db-shm', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'app.db-shm')).toBe(true)
	})

	it('**/*.db-wal matches root-level wal file', () => {
		const rule = { pattern: '**/*.db-wal', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'app.db-wal')).toBe(true)
	})

	it('**/*.db-shm matches nested shm file', () => {
		const rule = { pattern: '**/*.db-shm', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'data/app.db-shm')).toBe(true)
	})

	it('.env.* matches .env.local', () => {
		const rule = { pattern: '.env.*', patternType: 'glob' }
		expect(matchesProtectionRule(rule, '.env.local')).toBe(true)
	})

	it('**/credentials.json matches root', () => {
		const rule = { pattern: '**/credentials.json', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'credentials.json')).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// glob: edge cases
// ---------------------------------------------------------------------------

describe('glob: edge cases', () => {
	it('does not match empty string', () => {
		const rule = { pattern: '**/*.db', patternType: 'glob' }
		expect(matchesProtectionRule(rule, '')).toBe(false)
	})

	it('handles backslash-normalized Windows paths', () => {
		const rule = { pattern: '**/*.db', patternType: 'glob' }
		// normalizeProtectionPath converts backslashes before matching
		expect(matchesProtectionRule(rule, 'data\\test.db')).toBe(true)
	})

	it('handles multiple globstars', () => {
		const rule = { pattern: 'a/**/b/**/c', patternType: 'glob' }
		expect(matchesProtectionRule(rule, 'a/b/c')).toBe(true)
		expect(matchesProtectionRule(rule, 'a/x/b/y/c')).toBe(true)
	})

	it('unknown patternType returns false', () => {
		const rule = { pattern: 'foo', patternType: 'regex' }
		expect(matchesProtectionRule(rule, 'foo')).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// compareRulePriority
// ---------------------------------------------------------------------------

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
