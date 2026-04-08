import crypto from 'node:crypto'
import {
	createSession,
	endSession,
	getActiveSession
} from './db.js'

function generateSessionToken() {
	return crypto.randomUUID()
}

export function ensureActiveSession(sessionKey) {
	let session = getActiveSession(sessionKey)

	if (!session) {
		const sessionToken = generateSessionToken()
		createSession(sessionKey, sessionToken)
		session = getActiveSession(sessionKey)
	}

	return session
}

export function clearAndRotateSession(sessionKey) {
	const current = getActiveSession(sessionKey)

	if (current) {
		endSession(current.session_token)
	}

	const newSessionToken = generateSessionToken()
	createSession(sessionKey, newSessionToken)

	return getActiveSession(sessionKey)
}

export function startFreshSession(sessionKey) {
	return clearAndRotateSession(sessionKey)
}
