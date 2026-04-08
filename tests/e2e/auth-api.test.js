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
	tempDir = createTempDir('mhe-e2e-auth-')
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

describe('Health API', () => {
	it('GET /api/health returns 200', async () => {
		const { status, payload } = await request('GET', '/api/health')
		expect(status).toBe(200)
		expect(payload.ok).toBe(true)
		expect(payload.data.status).toBe('ok')
	})
})

describe('Auth API', () => {
	it('POST /api/auth/login with valid credentials returns session', async () => {
		const { status, payload, response } = await request('POST', '/api/auth/login', {
			body: {
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			}
		})
		expect(status).toBe(200)
		expect(payload.ok).toBe(true)
		expect(payload.data.csrfToken).toBeTruthy()
		expect(extractCookie(response)).toBeTruthy()
	})

	it('POST /api/auth/login with invalid credentials returns 401', async () => {
		const { status } = await request('POST', '/api/auth/login', {
			body: {
				loginName: 'root',
				password: 'wrong-password'
			}
		})
		expect(status).toBe(401)
	})

	it('GET /api/auth/me without auth returns null user', async () => {
		const { status, payload } = await request('GET', '/api/auth/me')
		expect(status).toBe(200)
		expect(payload.data.user).toBeNull()
	})

	it('GET /api/auth/me with session returns user', async () => {
		const login = await request('POST', '/api/auth/login', {
			body: {
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			}
		})
		const cookie = extractCookie(login.response)

		const { status, payload } = await request('GET', '/api/auth/me', {
			cookies: [cookie]
		})
		expect(status).toBe(200)
		expect(payload.data.user).not.toBeNull()
		expect(payload.data.user.loginName).toBe('root')
	})

	it('POST /api/auth/logout invalidates session cookie', async () => {
		const login = await request('POST', '/api/auth/login', {
			body: {
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			}
		})
		const cookie = extractCookie(login.response)

		const { status, response } = await request('POST', '/api/auth/logout', {
			cookies: [cookie]
		})
		expect(status).toBe(200)
		const logoutCookie = response.headers.get('set-cookie')
		expect(logoutCookie).toContain('Max-Age=0')
	})

	it('GET /api/bootstrap without auth returns 401', async () => {
		const { status } = await request('GET', '/api/bootstrap')
		expect(status).toBe(401)
	})

	it('GET /api/bootstrap with session returns data', async () => {
		const login = await request('POST', '/api/auth/login', {
			body: {
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			}
		})
		const cookie = extractCookie(login.response)

		const { status, payload } = await request('GET', '/api/bootstrap', {
			cookies: [cookie]
		})
		expect(status).toBe(200)
		expect(Array.isArray(payload.data.conversations)).toBe(true)
		expect(Array.isArray(payload.data.apiTokens)).toBe(true)
	})
})

describe('Personal Access Tokens', () => {
	let cookie
	let csrfToken

	beforeAll(async () => {
		const login = await request('POST', '/api/auth/login', {
			body: {
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			}
		})
		cookie = extractCookie(login.response)
		csrfToken = login.payload.data.csrfToken
	})

	it('POST /api/me/tokens creates token', async () => {
		const { status, payload } = await request('POST', '/api/me/tokens', {
			cookies: [cookie],
			headers: { 'x-csrf-token': csrfToken },
			body: { name: 'E2E Test Token' }
		})
		expect(status).toBe(201)
		expect(payload.data.token).toBeTruthy()
		expect(payload.data.id).toBeTruthy()
	})

	it('DELETE /api/me/tokens/:id revokes token', async () => {
		const created = await request('POST', '/api/me/tokens', {
			cookies: [cookie],
			headers: { 'x-csrf-token': csrfToken },
			body: { name: 'Revoke Me Token' }
		})

		const { status, payload } = await request('DELETE', `/api/me/tokens/${created.payload.data.id}`, {
			cookies: [cookie],
			headers: { 'x-csrf-token': csrfToken }
		})
		expect(status).toBe(200)
		expect(payload.data.revoked).toBe(true)
	})

	it('Bearer token can access protected endpoints', async () => {
		const created = await request('POST', '/api/me/tokens', {
			cookies: [cookie],
			headers: { 'x-csrf-token': csrfToken },
			body: { name: 'Bearer Test' }
		})
		const token = created.payload.data.token

		const { status, payload } = await request('GET', '/api/conversations', {
			headers: { Authorization: `Bearer ${token}` }
		})
		expect(status).toBe(200)
		expect(payload.ok).toBe(true)
	})
})

describe('CSRF Protection', () => {
	let cookie

	beforeAll(async () => {
		const login = await request('POST', '/api/auth/login', {
			body: {
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			}
		})
		cookie = extractCookie(login.response)
	})

	it('mutation without CSRF token returns 403', async () => {
		const { status } = await request('POST', '/api/conversations', {
			cookies: [cookie],
			body: { title: 'No CSRF' }
		})
		expect(status).toBe(403)
	})

	it('Bearer auth does not require CSRF', async () => {
		const login = await request('POST', '/api/auth/login', {
			body: {
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			}
		})
		const csrf = login.payload.data.csrfToken
		const loginCookie = extractCookie(login.response)

		const created = await request('POST', '/api/me/tokens', {
			cookies: [loginCookie],
			headers: { 'x-csrf-token': csrf },
			body: { name: 'CSRF Free' }
		})
		const token = created.payload.data.token

		const { status } = await request('POST', '/api/conversations', {
			headers: { Authorization: `Bearer ${token}` },
			body: { title: 'No CSRF Needed' }
		})
		expect(status).toBe(201)
	})
})
