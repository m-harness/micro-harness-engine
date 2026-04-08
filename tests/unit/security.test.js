import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import {
	hashPassword,
	verifyPassword,
	sha256,
	parseCookies,
	serializeCookie,
	addHours,
	addMinutes,
	verifySlackSignature,
	verifyDiscordSignature
} from '../../src/core/security.js'

describe('hashPassword + verifyPassword', () => {
	it('roundtrip succeeds with correct password', () => {
		const { salt, hash } = hashPassword('mysecretpassword')
		expect(verifyPassword('mysecretpassword', salt, hash)).toBe(true)
	})

	it('fails with wrong password', () => {
		const { salt, hash } = hashPassword('mysecretpassword')
		expect(verifyPassword('wrongpassword!!', salt, hash)).toBe(false)
	})

	it('uses provided salt', () => {
		const salt = 'custom-salt-hex-16'
		const { salt: returnedSalt } = hashPassword('test', salt)
		expect(returnedSalt).toBe(salt)
	})
})

describe('sha256', () => {
	it('produces known hash for known input', () => {
		const result = sha256('hello')
		expect(result).toBe(
			crypto.createHash('sha256').update('hello').digest('hex')
		)
	})

	it('different inputs produce different hashes', () => {
		expect(sha256('a')).not.toBe(sha256('b'))
	})
})

describe('parseCookies', () => {
	it('parses key=value pairs', () => {
		const result = parseCookies('name=value; key=val')
		expect(result).toEqual({ name: 'value', key: 'val' })
	})

	it('returns empty object for empty string', () => {
		expect(parseCookies('')).toEqual({})
	})

	it('returns empty object for undefined', () => {
		expect(parseCookies(undefined)).toEqual({})
	})

	it('decodes URI-encoded values', () => {
		const result = parseCookies('token=hello%20world')
		expect(result.token).toBe('hello world')
	})
})

describe('serializeCookie', () => {
	it('creates basic cookie string', () => {
		const cookie = serializeCookie('session', 'abc123')
		expect(cookie).toContain('session=abc123')
		expect(cookie).toContain('Path=/')
		expect(cookie).toContain('HttpOnly')
		expect(cookie).toContain('SameSite=Lax')
	})

	it('includes Max-Age when specified', () => {
		const cookie = serializeCookie('s', 'v', { maxAge: 3600 })
		expect(cookie).toContain('Max-Age=3600')
	})

	it('sets custom path', () => {
		const cookie = serializeCookie('s', 'v', { path: '/api' })
		expect(cookie).toContain('Path=/api')
	})

	it('respects httpOnly=false', () => {
		const cookie = serializeCookie('s', 'v', { httpOnly: false })
		expect(cookie).not.toContain('HttpOnly')
	})

	it('sets custom SameSite', () => {
		const cookie = serializeCookie('s', 'v', { sameSite: 'None' })
		expect(cookie).toContain('SameSite=None')
	})
})

describe('addHours', () => {
	it('adds hours correctly', () => {
		const base = new Date('2024-01-01T00:00:00Z')
		const result = addHours(base, 3)
		expect(result.toISOString()).toBe('2024-01-01T03:00:00.000Z')
	})
})

describe('addMinutes', () => {
	it('adds minutes correctly', () => {
		const base = new Date('2024-01-01T00:00:00Z')
		const result = addMinutes(base, 90)
		expect(result.toISOString()).toBe('2024-01-01T01:30:00.000Z')
	})
})

describe('verifySlackSignature', () => {
	const signingSecret = 'test-signing-secret'

	function createValidSignature(timestamp, body) {
		const base = `v0:${timestamp}:${body}`
		const digest = `v0=${crypto.createHmac('sha256', signingSecret).update(base).digest('hex')}`
		return digest
	}

	it('accepts correct signature', () => {
		const timestamp = String(Math.floor(Date.now() / 1000))
		const rawBody = '{"event":"test"}'
		const signature = createValidSignature(timestamp, rawBody)

		expect(verifySlackSignature({
			signingSecret,
			timestamp,
			rawBody,
			signature
		})).toBe(true)
	})

	it('rejects incorrect signature', () => {
		const timestamp = String(Math.floor(Date.now() / 1000))
		expect(verifySlackSignature({
			signingSecret,
			timestamp,
			rawBody: '{"event":"test"}',
			signature: 'v0=invalid_signature_hex_value_here_0123456789abcdef0123456789abcdef'
		})).toBe(false)
	})

	it('rejects expired timestamp (>5 minutes)', () => {
		const timestamp = String(Math.floor(Date.now() / 1000) - 400)
		const rawBody = '{"event":"test"}'
		const signature = createValidSignature(timestamp, rawBody)

		expect(verifySlackSignature({
			signingSecret,
			timestamp,
			rawBody,
			signature
		})).toBe(false)
	})

	it('returns false when missing parameters', () => {
		expect(verifySlackSignature({
			signingSecret: null,
			timestamp: '123',
			rawBody: 'x',
			signature: 'x'
		})).toBe(false)
	})
})

describe('verifyDiscordSignature', () => {
	it('returns false for invalid/missing data', () => {
		expect(verifyDiscordSignature({
			publicKey: null,
			timestamp: '123',
			rawBody: 'test',
			signature: 'abcdef'
		})).toBe(false)
	})

	it('returns false for malformed signature', () => {
		expect(verifyDiscordSignature({
			publicKey: 'aa'.repeat(32),
			timestamp: '123',
			rawBody: 'test',
			signature: 'invalid'
		})).toBe(false)
	})
})
