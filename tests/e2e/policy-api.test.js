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
	tempDir = createTempDir('mhe-e2e-policy-')
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

describe('Tool Policy API', () => {
	let adminCookie
	let adminCsrf
	let toolNames

	beforeAll(async () => {
		const login = await request('POST', '/api/admin/auth/login', {
			body: {
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			}
		})
		adminCookie = extractCookie(login.response)
		adminCsrf = login.payload.data.csrfToken

		// Get available tool names from bootstrap
		const bootstrapRes = await request('GET', '/api/admin/bootstrap', {
			cookies: [adminCookie]
		})
		const allTools = bootstrapRes.payload.data.tools
		toolNames = allTools.map(t => t.name)
	})

	it('POST /api/admin/tool-policies creates a policy', async () => {
		const tools = toolNames.length > 0 ? [toolNames[0]] : []
		const { status, payload } = await request('POST', '/api/admin/tool-policies', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				name: 'E2E Tool Policy',
				description: 'Created via E2E test',
				tools
			}
		})
		expect(status).toBe(201)
		expect(payload.data.name).toBe('E2E Tool Policy')
	})

	it('PATCH /api/admin/tool-policies/:id updates a policy', async () => {
		const tools = toolNames.length > 0 ? [toolNames[0]] : []
		const createRes = await request('POST', '/api/admin/tool-policies', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: { name: 'Update Me', tools }
		})
		const policyId = createRes.payload.data.id

		const { status, payload } = await request('PATCH', `/api/admin/tool-policies/${policyId}`, {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: { name: 'Updated Policy', tools }
		})
		expect(status).toBe(200)
		expect(payload.data.name).toBe('Updated Policy')
	})

	it('DELETE /api/admin/tool-policies/:id deletes a policy', async () => {
		const tools = toolNames.length > 0 ? [toolNames[0]] : []
		const createRes = await request('POST', '/api/admin/tool-policies', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: { name: 'Delete Me', tools }
		})
		const policyId = createRes.payload.data.id

		const { status, payload } = await request('DELETE', `/api/admin/tool-policies/${policyId}`, {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {}
		})
		expect(status).toBe(200)
		expect(payload.data.deletedPolicyId).toBe(policyId)
	})
})

describe('File Policy API', () => {
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

	it('POST /api/admin/file-policies creates a policy', async () => {
		const { status, payload } = await request('POST', '/api/admin/file-policies', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				name: 'E2E File Policy',
				description: 'Created via E2E test'
			}
		})
		expect(status).toBe(201)
		expect(payload.data.name).toBe('E2E File Policy')
	})

	it('POST /api/admin/file-policies/:id/roots adds a root', async () => {
		const createRes = await request('POST', '/api/admin/file-policies', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: { name: 'Root Test Policy' }
		})
		const policyId = createRes.payload.data.id

		const { status, payload } = await request('POST', `/api/admin/file-policies/${policyId}/roots`, {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				scope: 'workspace',
				rootPath: 'src',
				pathType: 'dir'
			}
		})
		expect(status).toBe(201)
		expect(payload.data.scope).toBe('workspace')
	})

	it('DELETE /api/admin/file-policies/:id/roots/:rootId removes a root', async () => {
		const createRes = await request('POST', '/api/admin/file-policies', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: { name: 'Root Delete Policy' }
		})
		const policyId = createRes.payload.data.id

		const rootRes = await request('POST', `/api/admin/file-policies/${policyId}/roots`, {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {
				scope: 'workspace',
				rootPath: 'tests',
				pathType: 'dir'
			}
		})
		const rootId = rootRes.payload.data.id

		const { status } = await request('DELETE', `/api/admin/file-policies/${policyId}/roots/${rootId}`, {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf }
		})
		expect(status).toBe(200)
	})

	it('DELETE /api/admin/file-policies/:id deletes a policy', async () => {
		const createRes = await request('POST', '/api/admin/file-policies', {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: { name: 'Delete FP' }
		})
		const policyId = createRes.payload.data.id

		const { status, payload } = await request('DELETE', `/api/admin/file-policies/${policyId}`, {
			cookies: [adminCookie],
			headers: { 'x-csrf-token': adminCsrf },
			body: {}
		})
		expect(status).toBe(200)
		expect(payload.data.deletedPolicyId).toBe(policyId)
	})
})
