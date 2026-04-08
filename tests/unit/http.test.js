import { describe, it, expect, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import {
	HttpError,
	readRawBody,
	requireString,
	requireOptionalString,
	mapErrorToResponse,
	applySecurityHeaders
} from '../../src/core/http.js'

function createMockReq(body, headers = {}) {
	const stream = new PassThrough()
	const buf = Buffer.from(body)
	stream.headers = { 'content-length': String(buf.length), ...headers }
	const origDestroy = stream.destroy.bind(stream)
	stream.destroy = vi.fn(() => origDestroy())
	stream.end(buf)
	return stream
}

function createMockRes() {
	const headers = {}
	return {
		setHeader(name, value) { headers[name] = value },
		getHeaders() { return headers }
	}
}

describe('readRawBody (C-1: body size limit)', () => {
	it('reads body within size limit', async () => {
		const req = createMockReq('hello world')
		const result = await readRawBody(req)
		expect(result).toBe('hello world')
	})

	it('rejects body when Content-Length exceeds limit', async () => {
		const req = createMockReq('x')
		req.headers['content-length'] = '999999999'
		try {
			await readRawBody(req)
			expect.unreachable('should have thrown')
		} catch (e) {
			expect(e).toBeInstanceOf(HttpError)
			expect(e.statusCode).toBe(413)
		}
	})

	it('rejects body when streaming exceeds limit', async () => {
		const stream = new PassThrough()
		stream.headers = {}
		const origDestroy = stream.destroy.bind(stream)
		stream.destroy = vi.fn(() => origDestroy())

		// Write more than 1MB in chunks
		const chunk = Buffer.alloc(256 * 1024, 'x')
		for (let i = 0; i < 5; i++) {
			stream.write(chunk)
		}
		stream.end()

		try {
			await readRawBody(stream)
			expect.unreachable('should have thrown')
		} catch (e) {
			expect(e).toBeInstanceOf(HttpError)
			expect(e.statusCode).toBe(413)
		}
	})
})

describe('applySecurityHeaders (C-2)', () => {
	it('sets API security headers', () => {
		const res = createMockRes()
		applySecurityHeaders(res)
		const h = res.getHeaders()
		expect(h['X-Content-Type-Options']).toBe('nosniff')
		expect(h['X-Frame-Options']).toBe('DENY')
		expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
		expect(h['Content-Security-Policy']).toContain("default-src 'none'")
	})

	it('sets SPA security headers with script-src self', () => {
		const res = createMockRes()
		applySecurityHeaders(res, { isSpa: true })
		const h = res.getHeaders()
		expect(h['Content-Security-Policy']).toContain("script-src 'self'")
	})
})

describe('requireString (H-5: maxLength)', () => {
	it('returns trimmed value within limit', () => {
		expect(requireString('hello', 'field')).toBe('hello')
	})

	it('throws for empty string', () => {
		expect(() => requireString('', 'field')).toThrow(HttpError)
	})

	it('throws when exceeding default maxLength', () => {
		const long = 'x'.repeat(10_001)
		try {
			requireString(long, 'field')
			expect.unreachable('should have thrown')
		} catch (e) {
			expect(e).toBeInstanceOf(HttpError)
			expect(e.statusCode).toBe(400)
		}
	})

	it('throws when exceeding custom maxLength', () => {
		expect(() => requireString('toolong', 'field', { maxLength: 5 })).toThrow(HttpError)
	})

	it('accepts value at exact maxLength', () => {
		expect(requireString('abcde', 'field', { maxLength: 5 })).toBe('abcde')
	})
})

describe('requireOptionalString (H-5: maxLength)', () => {
	it('returns null for empty', () => {
		expect(requireOptionalString(null)).toBeNull()
		expect(requireOptionalString('')).toBeNull()
	})

	it('returns trimmed value', () => {
		expect(requireOptionalString(' hello ')).toBe('hello')
	})

	it('throws when exceeding maxLength', () => {
		expect(() => requireOptionalString('toolong', { maxLength: 3 })).toThrow(HttpError)
	})
})

describe('mapErrorToResponse (M-4: error masking)', () => {
	it('returns HttpError message as-is', () => {
		const result = mapErrorToResponse(new HttpError(400, 'Bad input'))
		expect(result.statusCode).toBe(400)
		expect(result.body.error).toBe('Bad input')
	})

	it('masks non-HttpError internal details', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
		const result = mapErrorToResponse(new Error('SQL error: table not found'))
		expect(result.statusCode).toBe(500)
		expect(result.body.error).toBe('An internal error occurred.')
		expect(result.body.error).not.toContain('SQL')
		spy.mockRestore()
	})

	it('logs internal errors to console.error', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
		const err = new Error('secret crash')
		mapErrorToResponse(err)
		expect(spy).toHaveBeenCalled()
		spy.mockRestore()
	})
})
