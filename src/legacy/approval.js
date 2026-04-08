import crypto from 'node:crypto'
import {
	deleteConversationState,
	getConversationState,
	saveConversationState
} from './db.js'

const PENDING_APPROVAL_KEY = 'pending_approval'

export function createPendingApproval(sessionToken, request) {
	const pendingApproval = {
		id: crypto.randomUUID(),
		status: 'pending',
		createdAt: new Date().toISOString(),
		...request
	}

	saveConversationState(sessionToken, PENDING_APPROVAL_KEY, pendingApproval)
	return pendingApproval
}

export function getPendingApproval(sessionToken) {
	return getConversationState(sessionToken, PENDING_APPROVAL_KEY)
}

export function clearPendingApproval(sessionToken) {
	deleteConversationState(sessionToken, PENDING_APPROVAL_KEY)
}
