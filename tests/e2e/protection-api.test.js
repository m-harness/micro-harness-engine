import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
	createTempDir, removeTempDir, setupTestEnv,
	request as req, extractCookie
} from '../helpers/setup.js'

let tempDir
let baseUrl
let server

beforeAll(async () => {
	tempDir = createTempDir('mhe-e2e-prot-')
	setupTestEnv(tempDir)

	const mod = await import(
		pathToFileURL(path.resolve('src/http/server.js')).href
	)
	server = mod.createApiServer()
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
	await new Promise(resolve => server.close(resolve))
	removeTempDir(tempDir)
})

function request(method, pathname, opts) {
	return req(baseUrl, method, pathname, opts)
}

describe('Protection Rules API', () => {
	let adminCookie
	let adminCsrf

	beforeAll(async () => {
		const login = await request('POST', '/api/admin/auth/login', {
			body: {
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			}
		})
		adminCookie = extractCookie(login.response)
		adminCsrf = login.payload.data.csrfToken
	})

	it('GET /api/admin/protection-rules lists default rules', async () => {
		const { status, payload } = await request('GET', '/api/admin/protection-rules', {
			cookies: [adminCookie]
		})
		expect(status).toBe(200)
		// API returns { ok, data: { ok, rules: [...] } }
		const rules = payload.data.rules
		expect(Array.isArray(rules)).toBe(true)
		expect(rules.length).toBeGreaterThanOrEqual(1)
		expect(rules.some(r => r.pattern === '.env')).toBe(true)
	})

	it('POST /api/admin/protection-rules creates a rule', async () => {
		const { status, payload } = await request('POST', '/api/admin/protection-rules', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				kind: 'path',
				pattern: 'test-protected.txt',
				priority: 50
			}
		})
		expect(status).toBe(201)
		expect(payload.data.pattern).toBe('test-protected.txt')
		expect(payload.data.rule).toBeTruthy()
	})

	it('PATCH /api/admin/protection-rules/:id toggles enabled', async () => {
		const createRes = await request('POST', '/api/admin/protection-rules', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				kind: 'path',
				pattern: 'toggle-rule.txt',
				priority: 50
			}
		})
		const ruleId = createRes.payload.data.rule.id

		const { status, payload } = await request('PATCH', `/api/admin/protection-rules/${ruleId}`, {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: { enabled: false }
		})
		expect(status).toBe(200)
		expect(payload.data.enabled).toBe(false)
	})

	it('DELETE /api/admin/protection-rules/:id removes a rule', async () => {
		const createRes = await request('POST', '/api/admin/protection-rules', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				kind: 'path',
				pattern: 'deleteme.txt',
				priority: 50
			}
		})
		const ruleId = createRes.payload.data.rule.id

		const { status } = await request('DELETE', `/api/admin/protection-rules/${ruleId}`, {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf }
		})
		expect(status).toBe(200)
	})

	it('POST /api/admin/protection-rules/inspect checks path protection', async () => {
		const { status, payload } = await request('POST', '/api/admin/protection-rules/inspect', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: { path: '.env' }
		})
		expect(status).toBe(200)
		expect(payload.data.effect).toBe('deny')
		expect(payload.data.protected).toBe(true)
	})
})
