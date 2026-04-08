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
	tempDir = createTempDir('mhe-e2e-admin-')
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

describe('Admin Auth API', () => {
	it('POST /api/admin/auth/login returns admin session', async () => {
		const { status, payload, response } = await request('POST', '/api/admin/auth/login', {
			body: {
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			}
		})
		expect(status).toBe(200)
		expect(payload.data.adminAuthenticated).toBe(true)
		expect(payload.data.csrfToken).toBeTruthy()
		expect(extractCookie(response)).toBeTruthy()
	})
})

describe('Admin Bootstrap API', () => {
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

	it('GET /api/admin/bootstrap returns admin data', async () => {
		const { status, payload } = await request('GET', '/api/admin/bootstrap', {
			cookies: [adminCookie]
		})
		expect(status).toBe(200)
		expect(Array.isArray(payload.data.users)).toBe(true)
		expect(Array.isArray(payload.data.toolPolicies)).toBe(true)
		expect(Array.isArray(payload.data.filePolicies)).toBe(true)
	})
})

describe('Admin User CRUD', () => {
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

	it('POST /api/admin/users creates a user', async () => {
		const { status, payload } = await request('POST', '/api/admin/users', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				loginName: 'newuser',
				displayName: 'New User',
				password: 'LongPassword12!'
			}
		})
		expect(status).toBe(201)
		expect(payload.data.loginName).toBe('newuser')
	})

	it('PATCH /api/admin/users/:id updates a user', async () => {
		const createRes = await request('POST', '/api/admin/users', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				loginName: 'patchuser',
				displayName: 'Patch User',
				password: 'LongPassword12!'
			}
		})
		const userId = createRes.payload.data.id

		const { status, payload } = await request('PATCH', `/api/admin/users/${userId}`, {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				displayName: 'Updated Name'
			}
		})
		expect(status).toBe(200)
		expect(payload.data.displayName).toBe('Updated Name')
	})

	it('DELETE /api/admin/users/:id deletes a user', async () => {
		const createRes = await request('POST', '/api/admin/users', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				loginName: 'deleteuser',
				displayName: 'Delete User',
				password: 'LongPassword12!'
			}
		})
		const userId = createRes.payload.data.id

		const { status, payload } = await request('DELETE', `/api/admin/users/${userId}`, {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf }
		})
		expect(status).toBe(200)
		expect(payload.data.deleted).toBe(true)
	})

	it('POST /api/admin/users/:id/password changes password', async () => {
		const createRes = await request('POST', '/api/admin/users', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				loginName: 'pwdchange',
				displayName: 'PWD User',
				password: 'LongPassword12!'
			}
		})
		const userId = createRes.payload.data.id

		const { status } = await request('POST', `/api/admin/users/${userId}/password`, {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				password: 'newLongPassword12!'
			}
		})
		expect(status).toBe(200)
	})

	it('PATCH /api/admin/users/:id/policies assigns policies', async () => {
		const createRes = await request('POST', '/api/admin/users', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				loginName: 'policyuser',
				displayName: 'Policy User',
				password: 'LongPassword12!'
			}
		})
		const userId = createRes.payload.data.id

		const bootstrapRes = await request('GET', '/api/admin/bootstrap', {
			cookies: [adminCookie]
		})
		const toolPolicyId = bootstrapRes.payload.data.toolPolicies[0].id
		const filePolicyId = bootstrapRes.payload.data.filePolicies[0].id

		const { status } = await request('PATCH', `/api/admin/users/${userId}/policies`, {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				toolPolicyId,
				filePolicyId
			}
		})
		expect(status).toBe(200)
	})
})
