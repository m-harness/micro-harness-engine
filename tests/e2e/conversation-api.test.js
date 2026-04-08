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
	tempDir = createTempDir('mhe-e2e-convo-')
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

describe('Conversation API', () => {
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

	it('POST /api/conversations creates a conversation', async () => {
		const { status, payload } = await request('POST', '/api/conversations', {
			cookies: [cookie],
			headers: { 'x-csrf-token': csrfToken },
			body: { title: 'E2E Conversation' }
		})
		expect(status).toBe(201)
		expect(payload.data.id).toBeTruthy()
		expect(payload.data.title).toBe('E2E Conversation')
	})

	it('GET /api/conversations lists conversations', async () => {
		const { status, payload } = await request('GET', '/api/conversations', {
			cookies: [cookie]
		})
		expect(status).toBe(200)
		expect(Array.isArray(payload.data.conversations)).toBe(true)
		expect(payload.data.conversations.length).toBeGreaterThanOrEqual(1)
	})

	it('GET /api/conversations/:id returns conversation details', async () => {
		const createRes = await request('POST', '/api/conversations', {
			cookies: [cookie],
			headers: { 'x-csrf-token': csrfToken },
			body: { title: 'Detail Conversation' }
		})
		const conversationId = createRes.payload.data.id

		const { status, payload } = await request('GET', `/api/conversations/${conversationId}`, {
			cookies: [cookie]
		})
		expect(status).toBe(200)
		expect(payload.data.conversation.id).toBe(conversationId)
		expect(Array.isArray(payload.data.messages)).toBe(true)
	})

	it('other user cannot access conversations', async () => {
		// Create a second user
		const adminLogin = await request('POST', '/api/admin/auth/login', {
			body: {
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			}
		})
		const adminCookie = extractCookie(adminLogin.response)
		const adminCsrf = adminLogin.payload.data.csrfToken

		await request('POST', '/api/admin/users', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				loginName: 'otheruser',
				displayName: 'Other User',
				password: 'LongPassword12!'
			}
		})

		// Login as other user
		const otherLogin = await request('POST', '/api/auth/login', {
			body: {
				loginName: 'otheruser',
				password: 'LongPassword12!'
			}
		})
		const otherCookie = extractCookie(otherLogin.response)

		// List conversations - should be empty for this user
		const { status, payload } = await request('GET', '/api/conversations', {
			cookies: [otherCookie]
		})
		expect(status).toBe(200)
		expect(payload.data.conversations).toHaveLength(0)
	})
})
