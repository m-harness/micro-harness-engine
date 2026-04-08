import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')

export function createTempDir(prefix = 'mhe-test-') {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

export function removeTempDir(dirPath) {
	try {
		fs.rmSync(dirPath, { recursive: true, force: true })
	} catch {
		// ignore cleanup errors
	}
}

export function setupTestEnv(tempDir) {
	process.env.PROJECT_ROOT_DIR = tempDir
	process.env.APP_DB_PATH = path.join(tempDir, 'test.db')
	process.env.ADMIN_RUNTIME_PASSWORD = 'test-admin-password'
	process.env.ALLOWED_ORIGINS = ''
	process.env.LLM_PROVIDER = 'anthropic'
}

export async function createTestServer() {
	const tempDir = createTempDir('mhe-e2e-')
	setupTestEnv(tempDir)

	const serverModule = await import(
		pathToFileURL(path.join(repoRoot, 'src', 'http', 'server.js')).href
	)

	const server = serverModule.createApiServer()
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = server.address()
	const baseUrl = `http://127.0.0.1:${address.port}`

	return {
		server,
		baseUrl,
		tempDir,
		async cleanup() {
			await new Promise(resolve => server.close(resolve))
			removeTempDir(tempDir)
		}
	}
}

export function extractCookie(response) {
	const raw = response.headers.get('set-cookie')
	if (!raw) {
		return null
	}
	return raw.split(';')[0]
}

export async function request(baseUrl, method, pathname, {
	body,
	cookies = [],
	headers = {}
} = {}) {
	const response = await fetch(`${baseUrl}${pathname}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(cookies.length > 0 ? { Cookie: cookies.join('; ') } : {}),
			...headers
		},
		body: body == null ? undefined : JSON.stringify(body)
	})

	const payload = await response.json()
	return {
		status: response.status,
		payload,
		response
	}
}

export async function loginAsRoot(baseUrl) {
	const result = await request(baseUrl, 'POST', '/api/auth/login', {
		body: {
			loginName: 'root',
			password: process.env.ADMIN_RUNTIME_PASSWORD
		}
	})

	const cookie = extractCookie(result.response)
	const csrfToken = result.payload.data.csrfToken

	return {
		cookie,
		csrfToken,
		user: result.payload.data.user
	}
}

export async function loginAsAdmin(baseUrl) {
	const result = await request(baseUrl, 'POST', '/api/admin/auth/login', {
		body: {
			loginName: 'root',
			password: process.env.ADMIN_RUNTIME_PASSWORD
		}
	})

	const cookie = extractCookie(result.response)
	const csrfToken = result.payload.data.csrfToken

	return {
		cookie,
		csrfToken,
		user: result.payload.data.user
	}
}
