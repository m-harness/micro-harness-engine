import { listRunsToRecover } from './agentRuns.js'
import { sendConversationToAgentLoop } from './agentLoop.js'
import { logAssistantMessage, logError } from './logger.js'

export async function recoverInterruptedRunsForSession(sessionToken, options = {}) {
	const {
		onRecovered = null,
		onError = null
	} = options

	const recoverableRuns = listRunsToRecover().filter(
		run => run.session_token === sessionToken
	)

	const results = []

	for (const run of recoverableRuns) {
		try {
			const replyText = await sendConversationToAgentLoop(sessionToken)
			logAssistantMessage(replyText)

			const result = {
				ok: true,
				runId: run.run_id,
				phase: run.phase,
				replyText
			}

			results.push(result)

			if (typeof onRecovered === 'function') {
				await onRecovered(result)
			}
		} catch (error) {
			logError(error)

			const result = {
				ok: false,
				runId: run.run_id,
				phase: run.phase,
				error
			}

			results.push(result)

			if (typeof onError === 'function') {
				await onError(result)
			}
		}
	}

	return results
}

export function hasRecoverableRunForSession(sessionToken) {
	return listRunsToRecover().some(
		run => run.session_token === sessionToken
	)
}
