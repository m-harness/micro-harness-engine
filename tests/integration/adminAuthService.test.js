import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createTempDir, removeTempDir, setupTestEnv } from '../helpers/setup.js'

let tempDir
let AdminAuthService, AuthService

beforeAll(async () => {
	tempDir = createTempDir('mhe-adminauth-')
	setupTestEnv(tempDir)

	const adminMod = await import(
		pathToFileURL(path.resolve('src/core/adminAuthService.js')).href
	)
	AdminAuthService = adminMod.AdminAuthService

	const authMod = await import(
		pathToFileURL(path.resolve('src/core/authService.js')).href
	)
	AuthService = authMod.AuthService
})

afterAll(() => {
	removeTempDir(tempDir)
})

describe('AdminAuthService', () => {
	let adminAuthService
	let authService

	beforeAll(() => {
		adminAuthService = new AdminAuthService()
		authService = new AuthService()
	})

	describe('login', () => {
		it('logs in root with correct password', () => {
			const result = adminAuthService.login({
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			})
			expect(result.sessionToken).toBeTruthy()
			expect(result.csrfToken).toBeTruthy()
			expect(result.user.loginName).toBe('root')
		})

		it('rejects incorrect password with 401', () => {
			expect(() => {
				adminAuthService.login({
					loginName: 'root',
					password: 'wrong-password'
				})
			}).toThrow(/401|Invalid/i)
		})

		it('rejects non-existent user with 401', () => {
			expect(() => {
				adminAuthService.login({
					loginName: 'nobody',
					password: 'anypassword'
				})
			}).toThrow(/401|Invalid/i)
		})

		it('rejects inactive user with 403', () => {
			const user = authService.createLocalUser({
				loginName: 'admintest',
				password: 'LongPassword12!',
				displayName: 'Admin Test',
				role: 'admin'
			})
			authService.updateLocalUser(user.id, { status: 'inactive' })
			expect(() => {
				adminAuthService.login({
					loginName: 'admintest',
					password: 'LongPassword12!'
				})
			}).toThrow(/403|disabled/i)
		})

		it('rejects non-admin user with 403', () => {
			authService.createLocalUser({
				loginName: 'regularuser',
				password: 'LongPassword12!',
				displayName: 'Regular'
			})
			expect(() => {
				adminAuthService.login({
					loginName: 'regularuser',
					password: 'LongPassword12!'
				})
			}).toThrow(/403|not allowed/i)
		})
	})

	describe('resolveActor', () => {
		it('returns actor for valid session', () => {
			const login = adminAuthService.login({
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			})
			const actor = adminAuthService.resolveActor(login.sessionToken)
			expect(actor).not.toBeNull()
			expect(actor.admin).toBe(true)
			expect(actor.user.loginName).toBe('root')
			expect(actor.csrfToken).toBeTruthy()
		})

		it('returns null for null token', () => {
			expect(adminAuthService.resolveActor(null)).toBeNull()
		})

		it('returns null for invalid token', () => {
			expect(adminAuthService.resolveActor('bogus-token')).toBeNull()
		})
	})

	describe('logout', () => {
		it('invalidates session', () => {
			const login = adminAuthService.login({
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			})
			adminAuthService.logout(login.sessionToken)
			expect(adminAuthService.resolveActor(login.sessionToken)).toBeNull()
		})
	})
})
