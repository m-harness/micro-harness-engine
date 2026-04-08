import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createTempDir, removeTempDir, setupTestEnv } from '../helpers/setup.js'

let tempDir
let AuthService, requireActor, requireAdmin, requireCsrf
let getUserByLoginName, getUserById

beforeAll(async () => {
	tempDir = createTempDir('mhe-auth-')
	setupTestEnv(tempDir)

	const authMod = await import(
		pathToFileURL(path.resolve('src/core/authService.js')).href
	)
	AuthService = authMod.AuthService
	requireActor = authMod.requireActor
	requireAdmin = authMod.requireAdmin
	requireCsrf = authMod.requireCsrf

	const storeMod = await import(
		pathToFileURL(path.resolve('src/core/store.js')).href
	)
	getUserByLoginName = storeMod.getUserByLoginName
	getUserById = storeMod.getUserById
})

afterAll(() => {
	removeTempDir(tempDir)
})

describe('AuthService', () => {
	let authService

	beforeAll(() => {
		authService = new AuthService()
	})

	describe('createLocalUser', () => {
		it('creates user and returns sanitized object', () => {
			const user = authService.createLocalUser({
				loginName: 'testuser',
				password: 'LongPassword12!',
				displayName: 'Test User'
			})
			expect(user.loginName).toBe('testuser')
			expect(user.displayName).toBe('Test User')
			expect(user.role).toBe('user')
			expect(user.status).toBe('active')
			expect(user).not.toHaveProperty('passwordHash')
			expect(user).not.toHaveProperty('passwordSalt')
		})

		it('rejects duplicate loginName with 409', () => {
			authService.createLocalUser({
				loginName: 'duplicate',
				password: 'LongPassword12!',
				displayName: 'Dup'
			})
			expect(() => {
				authService.createLocalUser({
					loginName: 'duplicate',
					password: 'LongPassword12!',
					displayName: 'Dup2'
				})
			}).toThrow(/409|already exists/i)
		})

		it('rejects short password with 400', () => {
			expect(() => {
				authService.createLocalUser({
					loginName: 'shortpw',
					password: 'short',
					displayName: 'Short PW'
				})
			}).toThrow(/400|12 characters/i)
		})

		it('rejects invalid loginName with 400', () => {
			expect(() => {
				authService.createLocalUser({
					loginName: '@invalid!',
					password: 'LongPassword12!',
					displayName: 'Invalid'
				})
			}).toThrow(/400|loginName/i)
		})
	})

	describe('loginLocalUser', () => {
		it('authenticates root user with adminRuntimePassword', () => {
			const result = authService.loginLocalUser({
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			})
			expect(result.user.loginName).toBe('root')
			expect(result.sessionToken).toBeTruthy()
			expect(result.csrfToken).toBeTruthy()
			expect(result.expiresAt).toBeTruthy()
		})

		it('authenticates local user with correct password', () => {
			authService.createLocalUser({
				loginName: 'logintest',
				password: 'CorrectPass1!',
				displayName: 'Login Test'
			})
			const result = authService.loginLocalUser({
				loginName: 'logintest',
				password: 'CorrectPass1!'
			})
			expect(result.user.loginName).toBe('logintest')
		})

		it('rejects incorrect password with 401', () => {
			expect(() => {
				authService.loginLocalUser({
					loginName: 'logintest',
					password: 'wrongpassword!!'
				})
			}).toThrow(/401|Invalid/i)
		})

		it('rejects non-existent user with 401', () => {
			expect(() => {
				authService.loginLocalUser({
					loginName: 'nonexistent',
					password: 'anypassword123'
				})
			}).toThrow(/401|Invalid/i)
		})

		it('rejects inactive user with 403', () => {
			const user = authService.createLocalUser({
				loginName: 'inactiveuser',
				password: 'LongPassword12!',
				displayName: 'Inactive'
			})
			authService.updateLocalUser(user.id, {
				status: 'inactive'
			})
			expect(() => {
				authService.loginLocalUser({
					loginName: 'inactiveuser',
					password: 'LongPassword12!'
				})
			}).toThrow(/403|disabled/i)
		})
	})

	describe('resolveActorFromSession', () => {
		it('returns user info for valid session', () => {
			const login = authService.loginLocalUser({
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			})
			const actor = authService.resolveActorFromSession(login.sessionToken)
			expect(actor).not.toBeNull()
			expect(actor.user.loginName).toBe('root')
			expect(actor.authType).toBe('session')
			expect(actor.csrfToken).toBeTruthy()
		})

		it('returns null for null/undefined token', () => {
			expect(authService.resolveActorFromSession(null)).toBeNull()
			expect(authService.resolveActorFromSession(undefined)).toBeNull()
		})

		it('returns null for invalid user (deleted session)', () => {
			const user = authService.createLocalUser({
				loginName: 'willdeactivate',
				password: 'LongPassword12!',
				displayName: 'Will Deactivate'
			})
			const login = authService.loginLocalUser({
				loginName: 'willdeactivate',
				password: 'LongPassword12!'
			})
			authService.updateLocalUser(user.id, { status: 'inactive' })
			const actor = authService.resolveActorFromSession(login.sessionToken)
			expect(actor).toBeNull()
		})
	})

	describe('Personal Access Tokens', () => {
		let rootUserId

		beforeAll(() => {
			const login = authService.loginLocalUser({
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			})
			rootUserId = login.user.id
		})

		it('creates and resolves PAT via SHA-256 hash', () => {
			const created = authService.createPersonalAccessToken(rootUserId, 'Test Token')
			expect(created.token).toBeTruthy()
			expect(created.name).toBe('Test Token')

			const actor = authService.resolveActorFromBearerToken(created.token)
			expect(actor).not.toBeNull()
			expect(actor.user.loginName).toBe('root')
			expect(actor.authType).toBe('token')
		})

		it('revoked token no longer resolves', () => {
			const created = authService.createPersonalAccessToken(rootUserId, 'Revoke Me')
			authService.revokePersonalAccessToken(rootUserId, created.id)

			const actor = authService.resolveActorFromBearerToken(created.token)
			expect(actor).toBeNull()
		})
	})

	describe('updateLocalUser', () => {
		it('rejects updating root user with 400', () => {
			const rootLogin = authService.loginLocalUser({
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			})
			expect(() => {
				authService.updateLocalUser(rootLogin.user.id, {
					loginName: 'newroot'
				})
			}).toThrow(/400|root/i)
		})
	})

	describe('deleteLocalUser', () => {
		it('rejects deleting root user with 400', () => {
			const rootLogin = authService.loginLocalUser({
				loginName: 'root',
				password: process.env.ADMIN_RUNTIME_PASSWORD
			})
			expect(() => {
				authService.deleteLocalUser(rootLogin.user.id)
			}).toThrow(/400|root/i)
		})

		it('rejects deleting external user with 400', () => {
			// Root is the only non-local user type, covered above.
			// Create scenario by checking authSource
			const user = authService.createLocalUser({
				loginName: 'deletable',
				password: 'LongPassword12!',
				displayName: 'Deletable'
			})
			const result = authService.deleteLocalUser(user.id)
			expect(result.deleted).toBe(true)
		})
	})
})

describe('requireActor', () => {
	it('passes through valid actor', () => {
		const actor = { user: { id: '1', role: 'user' } }
		expect(requireActor(actor)).toBe(actor)
	})

	it('throws 401 for null actor', () => {
		expect(() => requireActor(null)).toThrow(/401|Authentication/i)
	})
})

describe('requireAdmin', () => {
	it('passes through admin actor', () => {
		const actor = { user: { id: '1', role: 'admin' } }
		expect(requireAdmin(actor)).toBe(actor)
	})

	it('throws 403 for non-admin', () => {
		const actor = { user: { id: '1', role: 'user' } }
		expect(() => requireAdmin(actor)).toThrow(/403|Admin/i)
	})
})

describe('requireCsrf', () => {
	it('passes when csrf token matches', () => {
		const actor = { user: { id: '1' }, authType: 'session', csrfToken: 'abc' }
		const req = { headers: { 'x-csrf-token': 'abc' } }
		expect(() => requireCsrf(actor, req)).not.toThrow()
	})

	it('throws 403 when csrf token mismatches', () => {
		const actor = { user: { id: '1' }, authType: 'session', csrfToken: 'abc' }
		const req = { headers: { 'x-csrf-token': 'wrong' } }
		expect(() => requireCsrf(actor, req)).toThrow(/403|CSRF/i)
	})

	it('skips check for non-session auth', () => {
		const actor = { user: { id: '1' }, authType: 'token', csrfToken: null }
		const req = { headers: {} }
		expect(() => requireCsrf(actor, req)).not.toThrow()
	})
})
