import { appConfig } from './config.js'
import { HttpError } from './http.js'
import { addHours, createOpaqueToken, sha256, timingSafeStringEqual, verifyPassword } from './security.js'
import { hasLocalAdminUser, getUserById, getUserByLoginName } from './store.js'
import { ROOT_SYSTEM_USER_TYPE } from './systemDefaults.js'

function nowMs() {
	return Date.now()
}

function isExpired(session) {
	return !session || new Date(session.expiresAt).getTime() <= nowMs()
}

function sanitizeAdminUser(user) {
	if (!user) {
		return null
	}

	return {
		id: user.id,
		loginName: user.loginName,
		displayName: user.displayName,
		role: user.role,
		status: user.status,
		authSource: user.authSource,
		systemUserType: user.systemUserType
	}
}

export class AdminAuthService {
	constructor() {
		this.sessions = new Map()
	}

	isEnabled() {
		return Boolean(appConfig.adminRuntimePassword || hasLocalAdminUser())
	}

	login({
		loginName,
		password,
		userAgent = null,
		ipAddress = null
	}) {
		if (!this.isEnabled()) {
			throw new HttpError(503, 'Admin sign-in is not available.')
		}

		const normalizedLoginName = String(loginName || '').trim().toLowerCase()
		const user = getUserByLoginName(normalizedLoginName)
		if (!user) {
			throw new HttpError(401, 'Invalid admin credentials.')
		}

		if (user.status !== 'active') {
			throw new HttpError(403, 'This admin account is disabled.')
		}

		if (user.systemUserType === ROOT_SYSTEM_USER_TYPE) {
			if (!appConfig.adminRuntimePassword) {
				throw new HttpError(503, 'ADMIN_RUNTIME_PASSWORD is not configured.')
			}

			if (!timingSafeStringEqual(String(password || ''), appConfig.adminRuntimePassword)) {
				throw new HttpError(401, 'Invalid admin credentials.')
			}
		} else {
			if (user.role !== 'admin' || user.authSource !== 'local') {
				throw new HttpError(403, 'This account is not allowed to enter the admin console.')
			}

			if (!verifyPassword(String(password || ''), user.passwordSalt, user.passwordHash)) {
				throw new HttpError(401, 'Invalid admin credentials.')
			}
		}

		const sessionToken = createOpaqueToken()
		const csrfToken = createOpaqueToken()
		const expiresAt = addHours(new Date(), appConfig.adminSessionTtlHours).toISOString()
		this.sessions.set(sessionToken, {
			id: sessionToken,
			userId: user.id,
			csrfToken,
			expiresAt,
			userAgent,
			ipHash: ipAddress ? sha256(ipAddress) : null
		})

		return {
			sessionToken,
			csrfToken,
			expiresAt,
			user: sanitizeAdminUser(user)
		}
	}

	resolveActor(sessionToken) {
		if (!sessionToken) {
			return null
		}

		const session = this.sessions.get(sessionToken)
		if (isExpired(session)) {
			this.sessions.delete(sessionToken)
			return null
		}

		const user = getUserById(session.userId)
		if (!user || user.status !== 'active' || (user.role !== 'admin' && user.systemUserType !== ROOT_SYSTEM_USER_TYPE)) {
			this.sessions.delete(sessionToken)
			return null
		}

		// Touch: extend session expiry on each request
		session.expiresAt = addHours(new Date(), appConfig.adminSessionTtlHours).toISOString()

		return {
			authType: 'admin-session',
			sessionToken,
			csrfToken: session.csrfToken,
			expiresAt: session.expiresAt,
			admin: true,
			user: sanitizeAdminUser(user)
		}
	}

	logout(sessionToken) {
		if (sessionToken) {
			this.sessions.delete(sessionToken)
		}
	}
}

export function requireAdminActor(actor) {
	if (!actor?.admin) {
		throw new HttpError(401, 'Admin authentication is required.')
	}
	return actor
}

export function requireAdminCsrf(actor, req) {
	requireAdminActor(actor)
	const provided = req.headers['x-csrf-token']
	if (!provided || provided !== actor.csrfToken) {
		throw new HttpError(403, 'A valid admin CSRF token is required.')
	}
}
