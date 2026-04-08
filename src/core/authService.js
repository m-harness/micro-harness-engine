import { HttpError } from './http.js'
import {
	createOpaqueToken,
	hashPassword,
	sha256,
	timingSafeStringEqual,
	verifyPassword,
	addHours
} from './security.js'
import {
	appConfig
} from './config.js'
import {
	ROOT_SYSTEM_USER_TYPE
} from './systemDefaults.js'
import {
	createAuthSession,
	createPersonalAccessToken as insertPersonalAccessToken,
	createUser,
	deleteUserRecord,
	deleteAuthSession,
	deleteExpiredAuthSessions,
	deleteSessionsByUserId,
	ensureWebChannelIdentity,
	getAuthSession,
	getPersonalAccessTokenByHash,
	getUserByLoginName,
	getUserById,
	listPersonalAccessTokens,
	listUsers,
	markPersonalAccessTokenUsed,
	markUserLogin,
	revokePersonalAccessToken,
	touchAuthSession,
	updateUserPassword,
	updateUserRecord
} from './store.js'

function normalizeLoginName(value) {
	return String(value || '').trim().toLowerCase()
}

function isRootUser(user) {
	return user?.systemUserType === ROOT_SYSTEM_USER_TYPE
}

function validatePasswordStrength(password) {
	if (password.length < 12) {
		throw new HttpError(400, 'Password must be at least 12 characters long.')
	}
	let kinds = 0
	if (/[a-z]/.test(password)) kinds += 1
	if (/[A-Z]/.test(password)) kinds += 1
	if (/[0-9]/.test(password)) kinds += 1
	if (/[^a-zA-Z0-9]/.test(password)) kinds += 1
	if (kinds < 3) {
		throw new HttpError(400, 'Password must contain at least 3 of: lowercase, uppercase, digit, special character.')
	}
}

function sanitizeUser(user) {
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
		systemUserType: user.systemUserType,
		lastLoginAt: user.lastLoginAt
	}
}

export class AuthService {
	createLocalUser({
		loginName,
		password,
		displayName,
		role = 'user'
	}) {
		const normalizedLoginName = normalizeLoginName(loginName)
		if (!/^[a-z0-9][a-z0-9-_]{1,31}$/i.test(normalizedLoginName)) {
			throw new HttpError(400, 'loginName must be 2-32 characters using letters, numbers, - or _.')
		}

		if (getUserByLoginName(normalizedLoginName)) {
			throw new HttpError(409, 'A user with this login name already exists.')
		}

		const normalizedPassword = String(password || '')
		validatePasswordStrength(normalizedPassword)

		const trimmedDisplayName = String(displayName || normalizedLoginName).trim() || normalizedLoginName
		if (trimmedDisplayName.length > 100) {
			throw new HttpError(400, 'displayName must be at most 100 characters.')
		}

		const { salt, hash } = hashPassword(normalizedPassword)
		const user = createUser({
			loginName: normalizedLoginName,
			email: null,
			displayName: trimmedDisplayName,
			passwordHash: hash,
			passwordSalt: salt,
			role,
			authSource: 'local'
		})
		ensureWebChannelIdentity(user.id, user.displayName)
		return sanitizeUser(user)
	}

	listUsers() {
		return listUsers().map(sanitizeUser)
	}

	hasBootstrapGap() {
		return false
	}

	loginLocalUser({
		loginName,
		password,
		userAgent = null,
		ipAddress = null
	}) {
		deleteExpiredAuthSessions()
		const user = getUserByLoginName(normalizeLoginName(loginName))
		if (!user) {
			throw new HttpError(401, 'Invalid username or password.')
		}

		if (user.status !== 'active') {
			throw new HttpError(403, 'This user account is disabled.')
		}

		if (isRootUser(user)) {
			if (!appConfig.adminRuntimePassword) {
				throw new HttpError(503, 'Root runtime password is not configured.')
			}

			if (!timingSafeStringEqual(String(password || ''), appConfig.adminRuntimePassword)) {
				throw new HttpError(401, 'Invalid username or password.')
			}
		} else {
			if (user.authSource !== 'local') {
				throw new HttpError(401, 'Invalid username or password.')
			}

			if (!verifyPassword(String(password || ''), user.passwordSalt, user.passwordHash)) {
				throw new HttpError(401, 'Invalid username or password.')
			}
		}

		const sessionToken = createOpaqueToken()
		const csrfToken = createOpaqueToken()
		const expiresAt = addHours(new Date(), appConfig.authSessionTtlHours).toISOString()
		createAuthSession({
			sessionId: sessionToken,
			userId: user.id,
			csrfToken,
			expiresAt,
			userAgent,
			ipHash: ipAddress ? sha256(ipAddress) : null
		})
		ensureWebChannelIdentity(user.id, user.displayName)
		markUserLogin(user.id)

		return {
			sessionToken,
			csrfToken,
			expiresAt,
			user: sanitizeUser(getUserById(user.id))
		}
	}

	resolveActorFromSession(sessionToken, {
		userAgent = null,
		ipAddress = null
	} = {}) {
		if (!sessionToken) {
			return null
		}

		deleteExpiredAuthSessions()
		const session = getAuthSession(sessionToken)
		if (!session) {
			return null
		}

		if (new Date(session.expiresAt).getTime() <= Date.now()) {
			deleteAuthSession(sessionToken)
			return null
		}

		const user = getUserById(session.userId)
		if (!user || user.status !== 'active') {
			deleteAuthSession(sessionToken)
			return null
		}

		const nextExpiresAt = addHours(new Date(), appConfig.authSessionTtlHours).toISOString()
		touchAuthSession({
			sessionId: session.id,
			expiresAt: nextExpiresAt,
			userAgent,
			ipHash: ipAddress ? sha256(ipAddress) : null
		})

		return {
			authType: 'session',
			csrfToken: session.csrfToken,
			expiresAt: nextExpiresAt,
			user: sanitizeUser(user)
		}
	}

	resolveActorFromBearerToken(rawToken) {
		if (!rawToken) {
			return null
		}

		const token = getPersonalAccessTokenByHash(sha256(rawToken))
		if (!token) {
			return null
		}

		const user = getUserById(token.userId)
		if (!user || user.status !== 'active') {
			return null
		}

		markPersonalAccessTokenUsed(token.id)

		return {
			authType: 'token',
			csrfToken: null,
			expiresAt: null,
			user: sanitizeUser(user),
			personalAccessToken: {
				id: token.id,
				name: token.name
			}
		}
	}

	logoutSession(sessionToken) {
		if (sessionToken) {
			deleteAuthSession(sessionToken)
		}
	}

	createPersonalAccessToken(userId, name) {
		const token = createOpaqueToken()
		const record = insertPersonalAccessToken({
			userId,
			name: String(name || 'Default token').trim() || 'Default token',
			tokenHash: sha256(token)
		})

		return {
			...record,
			token
		}
	}

	listPersonalAccessTokens(userId) {
		return listPersonalAccessTokens(userId)
	}

	revokePersonalAccessToken(userId, tokenId) {
		revokePersonalAccessToken(tokenId, userId)
	}

	updateLocalUser(userId, {
		loginName,
		displayName,
		role,
		status
	}) {
		const current = getUserById(userId)
		if (!current) {
			throw new HttpError(404, 'User not found.')
		}

		if (isRootUser(current)) {
			throw new HttpError(400, 'The root user cannot be renamed, disabled, or have its role changed.')
		}

		const nextLoginName = normalizeLoginName(loginName ?? current.loginName)
		if (!/^[a-z0-9][a-z0-9-_]{1,31}$/i.test(nextLoginName)) {
			throw new HttpError(400, 'loginName must be 2-32 characters using letters, numbers, - or _.')
		}

		const existing = getUserByLoginName(nextLoginName)
		if (existing && existing.id !== current.id) {
			throw new HttpError(409, 'A user with this login name already exists.')
		}

		const nextDisplayName = String(displayName ?? current.displayName).trim() || current.displayName
		if (nextDisplayName.length > 100) {
			throw new HttpError(400, 'displayName must be at most 100 characters.')
		}

		const nextRole = role ?? current.role
		const nextStatus = status ?? current.status
		const roleOrStatusChanged = nextRole !== current.role || nextStatus !== current.status

		const result = sanitizeUser(updateUserRecord({
			id: current.id,
			loginName: nextLoginName,
			displayName: nextDisplayName,
			role: nextRole,
			status: nextStatus
		}))

		if (roleOrStatusChanged) {
			deleteSessionsByUserId(current.id)
		}

		return result
	}

	setLocalUserPassword(userId, password) {
		const user = getUserById(userId)
		if (!user) {
			throw new HttpError(404, 'User not found.')
		}

		if (isRootUser(user)) {
			throw new HttpError(400, 'The root user password is managed by ADMIN_RUNTIME_PASSWORD.')
		}

		const normalizedPassword = String(password || '')
		validatePasswordStrength(normalizedPassword)

		const { salt, hash } = hashPassword(normalizedPassword)
		const result = sanitizeUser(updateUserPassword({
			userId,
			passwordHash: hash,
			passwordSalt: salt
		}))
		deleteSessionsByUserId(userId)
		return result
	}

	deleteLocalUser(userId) {
		const user = getUserById(userId)
		if (!user) {
			throw new HttpError(404, 'User not found.')
		}

		if (isRootUser(user)) {
			throw new HttpError(400, 'The root user cannot be deleted.')
		}

		if (user.authSource !== 'local') {
			throw new HttpError(400, 'Only locally managed users can be deleted from the admin console.')
		}

		deleteUserRecord(userId)
		return {
			deleted: true,
			userId
		}
	}
}

export function requireActor(actor) {
	if (!actor?.user) {
		throw new HttpError(401, 'Authentication is required.')
	}
	return actor
}

export function requireAdmin(actor) {
	requireActor(actor)
	if (actor.user.role !== 'admin') {
		throw new HttpError(403, 'Admin privileges are required.')
	}
	return actor
}

export function requireCsrf(actor, req) {
	if (!actor?.user || actor.authType !== 'session') {
		return
	}

	const provided = req.headers['x-csrf-token']
	if (!provided || provided !== actor.csrfToken) {
		throw new HttpError(403, 'A valid CSRF token is required.')
	}
}
