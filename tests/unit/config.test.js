import { describe, it, expect } from 'vitest'
import { isOriginAllowed } from '../../src/core/config.js'

describe('isOriginAllowed', () => {
	it('allows localhost', () => {
		expect(isOriginAllowed('http://localhost')).toBe(true)
		expect(isOriginAllowed('http://localhost:3000')).toBe(true)
	})

	it('allows 127.0.0.1', () => {
		expect(isOriginAllowed('http://127.0.0.1')).toBe(true)
		expect(isOriginAllowed('http://127.0.0.1:8080')).toBe(true)
	})

	it('rejects unknown external origin when ALLOWED_ORIGINS is not set', () => {
		expect(isOriginAllowed('https://evil.example.com')).toBe(false)
	})

	it('rejects null/undefined', () => {
		expect(isOriginAllowed(null)).toBe(false)
		expect(isOriginAllowed(undefined)).toBe(false)
		expect(isOriginAllowed('')).toBe(false)
	})
})
