import { describe, it, expect } from 'vitest'
import { timingSafeStringEqual } from '../../src/core/security.js'

describe('timingSafeStringEqual (H-3)', () => {
	it('returns true for identical strings', () => {
		expect(timingSafeStringEqual('password123', 'password123')).toBe(true)
	})

	it('returns false for different strings of same length', () => {
		expect(timingSafeStringEqual('password123', 'passwordabc')).toBe(false)
	})

	it('returns false for different length strings', () => {
		expect(timingSafeStringEqual('short', 'muchlongerstring')).toBe(false)
	})

	it('returns false for empty vs non-empty', () => {
		expect(timingSafeStringEqual('', 'notempty')).toBe(false)
	})

	it('returns true for two empty strings', () => {
		expect(timingSafeStringEqual('', '')).toBe(true)
	})

	it('handles unicode correctly', () => {
		expect(timingSafeStringEqual('日本語テスト', '日本語テスト')).toBe(true)
		expect(timingSafeStringEqual('日本語テスト', '日本語テスX')).toBe(false)
	})

	it('coerces non-string values', () => {
		expect(timingSafeStringEqual(12345, '12345')).toBe(true)
		expect(timingSafeStringEqual(null, 'null')).toBe(true)
	})
})
