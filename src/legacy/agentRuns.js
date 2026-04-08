import crypto from 'node:crypto'
import {
	createAgentRun,
	getAgentRun,
	getLatestRunForSession,
	getLatestPendingRunForSession,
	getRunToolCall,
	listRecoverableRuns,
	saveRunToolCall,
	updateAgentRun
} from './db.js'

function buildSnapshot(snapshot = {}) {
	return {
		providerName: snapshot.providerName || null,
		loopMessages: snapshot.loopMessages || [],
		continuationCount: snapshot.continuationCount || 0,
		assistantCheckpoint: snapshot.assistantCheckpoint || null
	}
}

export function startAgentRun(sessionToken, snapshot = {}) {
	const runId = crypto.randomUUID()

	return createAgentRun({
		runId,
		sessionToken,
		status: 'queued',
		phase: 'initializing',
		attemptCount: 0,
		snapshot: buildSnapshot(snapshot),
		principalAccountId: snapshot.principalAccountId || null,
		authRevisionSnapshot: snapshot.authRevisionSnapshot ?? 0,
		stopReason: snapshot.stopReason ?? null
	})
}

export function getPendingRun(sessionToken) {
	return getLatestPendingRunForSession(sessionToken)
}

export function getLatestRun(sessionToken) {
	return getLatestRunForSession(sessionToken)
}

export function listRunsToRecover() {
	return listRecoverableRuns()
}

export function markRunState(runId, updates = {}) {
	const current = getAgentRun(runId)

	if (!current) {
		throw new Error(`Unknown run: ${runId}`)
	}

	return updateAgentRun({
		runId,
		status: updates.status ?? current.status,
		phase: updates.phase ?? current.phase,
		attemptCount: updates.attemptCount ?? current.attempt_count ?? 0,
		lastError: updates.lastError ?? current.last_error ?? null,
		finalOutput: updates.finalOutput ?? current.final_output ?? null,
		snapshot: updates.snapshot ?? current.snapshot ?? null,
		principalAccountId: updates.principalAccountId ?? current.principal_account_id ?? null,
		authRevisionSnapshot: updates.authRevisionSnapshot ?? current.auth_revision_snapshot ?? 0,
		stopReason: updates.stopReason ?? current.stop_reason ?? null
	})
}

export function completeRun(runId, finalOutput, snapshot = null) {
	return markRunState(runId, {
		status: 'completed',
		phase: 'done',
		finalOutput,
		lastError: null,
		snapshot,
		stopReason: null
	})
}

export function failRun(runId, error, snapshot = null) {
	return markRunState(runId, {
		status: 'recovering',
		phase: 'error',
		lastError: error?.message || String(error),
		snapshot
	})
}

export function cancelRun(runId, stopReason, snapshot = null) {
	return markRunState(runId, {
		status: 'cancelled',
		phase: 'stopped',
		lastError: stopReason,
		stopReason,
		snapshot
	})
}

export function cacheToolCallStart({ runId, toolUseId, toolName, input }) {
	saveRunToolCall({
		runId,
		toolUseId,
		toolName,
		input,
		output: null,
		status: 'started',
		errorText: null,
		completedAt: null
	})
}

export function cacheToolCallResult({
	runId,
	toolUseId,
	toolName,
	input,
	output,
	status,
	errorText = null
}) {
	saveRunToolCall({
		runId,
		toolUseId,
		toolName,
		input,
		output,
		status,
		errorText,
		completedAt: new Date().toISOString()
	})
}

export function getCachedToolCall(runId, toolUseId) {
	return getRunToolCall(runId, toolUseId)
}
