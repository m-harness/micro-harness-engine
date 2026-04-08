import dotenv from 'dotenv'
import {
	getMessages,
	saveMessage,
	saveToolLog
} from './db.js'
import {
	cacheToolCallResult,
	cacheToolCallStart,
	cancelRun,
	completeRun,
	failRun,
	getCachedToolCall,
	getPendingRun,
	markRunState,
	startAgentRun
} from './agentRuns.js'
import {
	logApiRequest,
	logApiResponse,
	logError,
	logToolResult,
	logToolUse
} from './logger.js'
import {
	sanitizeMessagesForModel,
	sanitizeToolResultForModel
} from '../protection/service.js'
import {
	executeTool,
	getToolDefinitions
} from './tools/fileTools.js'
import { getAgentPolicy } from './policy.js'
import {
	authorizeToolRequest,
	getCurrentAuthRevision,
	getSessionOperatorAccountId
} from './policyService.js'
import {
	getActiveProvider,
	getProvider,
	resetProviderClientForTesting,
	setProviderClientForTesting
} from '../providers/index.js'
import {
	extractTextFromNormalizedBlocks,
	hasNormalizedToolCalls,
	normalizeConversationMessages
} from '../providers/common.js'

dotenv.config()

const MAX_API_RETRIES = Number.parseInt(process.env.MAX_API_RETRIES || '4', 10)
const MAX_TOOL_RETRIES = Number.parseInt(process.env.MAX_TOOL_RETRIES || '2', 10)
const MAX_CONTINUATIONS = Number.parseInt(process.env.MAX_CONTINUATIONS || '6', 10)
const DEFAULT_MAX_TOKENS = Number.parseInt(process.env.LLM_MAX_TOKENS || '1200', 10)
const testHooks = {
	afterAssistantMessage: null,
	afterToolResult: null
}

function buildSystemPrompt(options = {}) {
	const hasTools = options.hasTools !== false
	const lines = [
		'You are a local CLI agent.',
		'Use only the provided tools.',
		'Stay inside the current project root unless a read-only tool is given an absolute path under an allowlisted external location.',
		'Some files and directories are protected and may be hidden from discovery.',
		'External file access is available only for allowlisted absolute paths.',
		'Dangerous tools may be hidden by policy.',
		'In guided mode, dangerous tools require human approval through the CLI.',
		'If a dangerous tool is enabled, it may still require confirm="DELETE".',
		'If a tool call requests approval, ask the user to type y to continue or n to cancel.',
		'If a tool call is rejected, explain the policy and ask the user before trying again.',
		'If a path is protected, do not retry around the restriction. Ask the user to handle the file manually.',
		'If a tool or API call fails with a retryable error, recover and continue from the latest known good state.',
		'When a tool returns a structured error, use that information to investigate and try an alternate path before giving up.'
	]

	if (!hasTools) {
		lines.push(
			'No tools are currently available to you.',
			'You can still answer questions and provide guidance, but you cannot inspect files, change files, or perform any external action yourself.',
			'If the user wants an operation performed, explain the steps clearly and ask the user to do it manually.'
		)
	}

	return lines.join('\n')
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function buildNormalizedMessages(dbMessages) {
	const sanitized = sanitizeMessagesForModel(dbMessages.map(message => ({
		role: message.role,
		content: message.content
	})))

	return normalizeConversationMessages(sanitized)
}

function normalizeLoopMessages(loopMessages, providerName) {
	return normalizeConversationMessages(loopMessages, providerName)
}

function classifyApiError(error) {
	const status = error?.status ?? error?.statusCode ?? null
	const message = String(error?.message || '').toLowerCase()

	const retryable =
		status === 429 ||
		status === 500 ||
		status === 502 ||
		status === 503 ||
		status === 504 ||
		status === 529 ||
		message.includes('timeout') ||
		message.includes('timed out') ||
		message.includes('network') ||
		message.includes('overloaded') ||
		message.includes('rate limit') ||
		message.includes('connection')

	return {
		retryable,
		status,
		message: error?.message || 'Unknown API error'
	}
}

function classifyToolError(error) {
	const code = String(error?.code || '')
	const message = String(error?.message || '').toLowerCase()

	const retryable =
		code === 'ETIMEDOUT' ||
		code === 'EBUSY' ||
		code === 'EMFILE' ||
		message.includes('timeout') ||
		message.includes('temporarily') ||
		message.includes('resource busy')

	return {
		retryable,
		code: code || null,
		message: error?.message || 'Unknown tool error'
	}
}

function createLoopSnapshot(
	loopMessages,
	continuationCount = 0,
	providerName = null,
	assistantCheckpoint = null
) {
	return {
		providerName,
		loopMessages,
		continuationCount,
		assistantCheckpoint
	}
}

function resolveProviderForRun(activeRun) {
	const snapshotProviderName = activeRun?.snapshot?.providerName
	if (activeRun?.snapshot && !snapshotProviderName) {
		return getProvider('anthropic')
	}

	return snapshotProviderName
		? getProvider(snapshotProviderName)
		: getActiveProvider()
}

async function callModelWithRetry({
	sessionToken,
	runId,
	loopMessages,
	attemptCount,
	toolDefinitions,
	provider,
	continuationCount
}) {
	let lastError = null

	for (let attempt = 1; attempt <= MAX_API_RETRIES; attempt += 1) {
		await markRunState(runId, {
			status: 'api_inflight',
			phase: `calling_model:${provider.name}`,
			attemptCount: attemptCount + attempt - 1,
			lastError: lastError?.message || null,
			snapshot: createLoopSnapshot(loopMessages, continuationCount, provider.name)
		})

		saveToolLog(
			sessionToken,
			provider.apiLogName,
			{
				provider: provider.name,
				model: provider.getModel(),
				messageCount: loopMessages.length,
				attempt
			},
			null,
			'started'
		)

		try {
			const result = await provider.generate({
				messages: loopMessages,
				systemPrompt: buildSystemPrompt({
					hasTools: toolDefinitions.length > 0
				}),
				toolDefinitions,
				maxTokens: DEFAULT_MAX_TOKENS
			})

			return {
				result,
				attemptsUsed: attempt
			}
		} catch (error) {
			lastError = error
			const classification = classifyApiError(error)

			saveToolLog(
				sessionToken,
				provider.apiLogName,
				{
					provider: provider.name,
					model: provider.getModel(),
					messageCount: loopMessages.length,
					attempt
				},
				{
					ok: false,
					retryable: classification.retryable,
					status: classification.status,
					error: classification.message
				},
				classification.retryable ? 'retryable_error' : 'error'
			)

			if (!classification.retryable || attempt === MAX_API_RETRIES) {
				throw error
			}

			await sleep(500 * (2 ** (attempt - 1)))
		}
	}

	throw lastError
}

async function executeToolWithCache({ runId, sessionToken, policy, block }) {
	const cached = getCachedToolCall(runId, block.callId)

	if (cached?.status === 'success' || cached?.status === 'error') {
		return {
			result: cached.output,
			status: cached.status === 'success' ? 'success' : 'error',
			fromCache: true
		}
	}

	cacheToolCallStart({
		runId,
		toolUseId: block.callId,
		toolName: block.name,
		input: block.input
	})

	let lastError = null

	for (let attempt = 1; attempt <= MAX_TOOL_RETRIES; attempt += 1) {
		try {
			const result = await executeTool(block.name, block.input, {
				policy,
				sessionToken,
				runId
			})

			cacheToolCallResult({
				runId,
				toolUseId: block.callId,
				toolName: block.name,
				input: block.input,
				output: result,
				status: 'success'
			})

			return {
				result,
				status: 'success',
				fromCache: false
			}
		} catch (error) {
			lastError = error
			const classification = classifyToolError(error)

			if (!classification.retryable || attempt === MAX_TOOL_RETRIES) {
				const result = {
					ok: false,
					error: classification.message,
					errorType: classification.retryable ? 'retryable_tool_error' : 'tool_error',
					errorCode: classification.code,
					canRetry: classification.retryable,
					attempt
				}

				cacheToolCallResult({
					runId,
					toolUseId: block.callId,
					toolName: block.name,
					input: block.input,
					output: result,
					status: 'error',
					errorText: classification.message
				})

				return {
					result,
					status: 'error',
					fromCache: false
				}
			}

			await sleep(250 * (2 ** (attempt - 1)))
		}
	}

	throw lastError
}

function shouldContinueResponse(result, continuationCount) {
	if (hasNormalizedToolCalls(result.assistantMessage?.content || [])) {
		return false
	}

	return (
		(result.stopReason === 'max_tokens' || result.stopReason === 'pause_turn') &&
		continuationCount < MAX_CONTINUATIONS
	)
}

function getRecoveredAssistantResult(activeRun, pendingRun, loopMessages) {
	if (!pendingRun || !Array.isArray(loopMessages) || loopMessages.length === 0) {
		return null
	}

	const lastMessage = loopMessages[loopMessages.length - 1]

	if (lastMessage?.role !== 'assistant') {
		return null
	}

	return {
		assistantMessage: lastMessage,
		assistantText: extractTextFromNormalizedBlocks(lastMessage.content || []),
		stopReason: activeRun?.snapshot?.assistantCheckpoint?.stopReason || 'end_turn'
	}
}

function saveAssistantMessageIfNeeded(sessionToken, persistedMessages, finalText) {
	const lastPersistedMessage = persistedMessages[persistedMessages.length - 1]

	if (lastPersistedMessage?.role === 'assistant' && lastPersistedMessage.content === finalText) {
		return false
	}

	saveMessage(sessionToken, 'assistant', finalText)
	persistedMessages.push({
		role: 'assistant',
		content: finalText
	})
	return true
}

export async function sendConversationToAgentLoop(sessionToken) {
	const dbMessages = getMessages(sessionToken)
	const persistedMessages = [...dbMessages]
	const messages = buildNormalizedMessages(dbMessages)
	const policy = getAgentPolicy()
	const operatorAccountId = getSessionOperatorAccountId(sessionToken)
	const toolDefinitions = getToolDefinitions({
		runtimePolicy: policy,
		accountId: operatorAccountId
	})
	const pendingRun = getPendingRun(sessionToken)
	const activeRun = pendingRun || startAgentRun(
		sessionToken,
		{
			...createLoopSnapshot(messages, 0, getActiveProvider().name),
			principalAccountId: operatorAccountId,
			authRevisionSnapshot: getCurrentAuthRevision(operatorAccountId)
		}
	)
	const provider = resolveProviderForRun(activeRun)
	let loopMessages = activeRun.snapshot?.loopMessages?.length
		? normalizeLoopMessages(activeRun.snapshot.loopMessages, provider.name)
		: [...messages]
	let continuationCount = activeRun.snapshot?.continuationCount || 0
	let totalAttempts = activeRun.attempt_count || 0
	let assistantCheckpoint = activeRun.snapshot?.assistantCheckpoint || null
	let recoveredAssistantResult = getRecoveredAssistantResult(activeRun, pendingRun, loopMessages)

	logApiRequest(loopMessages, `${provider.name}_request`)

	try {
		while (true) {
			let result

			if (recoveredAssistantResult) {
				result = recoveredAssistantResult
				recoveredAssistantResult = null
			} else {
				const response = await callModelWithRetry({
					sessionToken,
					runId: activeRun.run_id,
					loopMessages,
					attemptCount: totalAttempts,
					toolDefinitions,
					provider,
					continuationCount
				})

				result = response.result
				totalAttempts += response.attemptsUsed
				const assistantBlocks = result.assistantMessage.content
				const assistantText = result.assistantText || extractTextFromNormalizedBlocks(assistantBlocks)

				if (assistantText) {
					logApiResponse(assistantText, `${provider.name}_response`)
				}

				loopMessages.push(result.assistantMessage)
				assistantCheckpoint = {
					stopReason: result.stopReason
				}

				await markRunState(activeRun.run_id, {
					status: 'queued',
					phase: `assistant_response:${provider.name}`,
					attemptCount: totalAttempts,
					lastError: null,
					principalAccountId: activeRun.principal_account_id || operatorAccountId,
					authRevisionSnapshot: activeRun.auth_revision_snapshot || getCurrentAuthRevision(operatorAccountId),
					snapshot: createLoopSnapshot(
						loopMessages,
						continuationCount,
						provider.name,
						assistantCheckpoint
					)
				})

				if (typeof testHooks.afterAssistantMessage === 'function') {
					await testHooks.afterAssistantMessage({
						result,
						runId: activeRun.run_id,
						sessionToken
					})
				}
			}

			const assistantBlocks = result.assistantMessage.content
			const assistantText = result.assistantText || extractTextFromNormalizedBlocks(assistantBlocks)

			if (shouldContinueResponse(result, continuationCount)) {
				continuationCount += 1
				const continuationMessage = typeof provider.createContinuationMessage === 'function'
					? provider.createContinuationMessage({
						stopReason: result.stopReason,
						assistantMessage: result.assistantMessage,
						assistantText,
						continuationCount,
						loopMessages
					})
					: null

				if (continuationMessage) {
					loopMessages.push(continuationMessage)
				}
				assistantCheckpoint = null

				await markRunState(activeRun.run_id, {
					status: 'queued',
					phase: `continuing_response:${provider.name}`,
					attemptCount: totalAttempts,
					principalAccountId: activeRun.principal_account_id || operatorAccountId,
					authRevisionSnapshot: activeRun.auth_revision_snapshot || getCurrentAuthRevision(operatorAccountId),
					snapshot: createLoopSnapshot(loopMessages, continuationCount, provider.name, assistantCheckpoint)
				})
				continue
			}

			if (!hasNormalizedToolCalls(assistantBlocks)) {
				const finalText = assistantText || 'No response text was returned.'
				saveAssistantMessageIfNeeded(sessionToken, persistedMessages, finalText)
				assistantCheckpoint = null

				saveToolLog(
					sessionToken,
					provider.apiLogName,
					{
						provider: provider.name,
						model: provider.getModel(),
						messageCount: loopMessages.length,
						attemptsUsed: totalAttempts
					},
					{
						text: finalText
					},
					'success'
				)

				completeRun(
					activeRun.run_id,
					finalText,
					createLoopSnapshot(loopMessages, continuationCount, provider.name, assistantCheckpoint)
				)

				return finalText
			}

			for (const block of assistantBlocks) {
				if (block.type !== 'tool_call') continue

				logToolUse(block.name, block.input)

				await markRunState(activeRun.run_id, {
					status: 'tool_inflight',
					phase: `tool:${block.name}`,
					attemptCount: totalAttempts,
					principalAccountId: activeRun.principal_account_id || operatorAccountId,
					authRevisionSnapshot: activeRun.auth_revision_snapshot || getCurrentAuthRevision(operatorAccountId),
					snapshot: createLoopSnapshot(loopMessages, continuationCount, provider.name, assistantCheckpoint)
				})

				const currentRevision = getCurrentAuthRevision(
					activeRun.principal_account_id || operatorAccountId
				)

				if (currentRevision !== (activeRun.auth_revision_snapshot || 0)) {
					const recheck = authorizeToolRequest({
						sessionToken,
						runId: activeRun.run_id,
						toolName: block.name,
						input: block.input
					})

					if (recheck.decision.decision !== 'ALLOW') {
						const stopText = recheck.decision.decision === 'ERROR'
							? '認可システムエラーのため実行できません'
							: '権限が変更されたため、この実行は停止しました。'
						saveAssistantMessageIfNeeded(sessionToken, persistedMessages, stopText)

						await cancelRun(
							activeRun.run_id,
							`auth_revision_changed:${recheck.decision.reasonCode}`,
							createLoopSnapshot(loopMessages, continuationCount, provider.name, assistantCheckpoint)
						)

						return stopText
					}

					activeRun.auth_revision_snapshot = currentRevision
					await markRunState(activeRun.run_id, {
						status: 'queued',
						phase: `auth_revalidated:${block.name}`,
						attemptCount: totalAttempts,
						principalAccountId: activeRun.principal_account_id || operatorAccountId,
						authRevisionSnapshot: currentRevision,
						snapshot: createLoopSnapshot(loopMessages, continuationCount, provider.name, assistantCheckpoint)
					})
				}

				const { result: toolResult, status } = await executeToolWithCache({
					runId: activeRun.run_id,
					sessionToken,
					policy,
					block
				})

				saveToolLog(
					sessionToken,
					block.name,
					block.input,
					toolResult,
					status
				)

				logToolResult(block.name, toolResult)
				const sanitizedResult = sanitizeToolResultForModel(toolResult)

				if (typeof testHooks.afterToolResult === 'function') {
					await testHooks.afterToolResult({
						block,
						result: toolResult,
						runId: activeRun.run_id,
						sessionToken
					})
				}

				loopMessages.push({
					role: 'tool',
					content: [
						{
							type: 'tool_result',
							callId: block.callId,
							name: block.name,
							output: sanitizedResult
						}
					]
				})
				assistantCheckpoint = null

				await markRunState(activeRun.run_id, {
					status: toolResult?.approvalRequired ? 'waiting_human' : 'queued',
					phase: toolResult?.approvalRequired ? `waiting_human:${block.name}` : `tool_result:${block.name}`,
					attemptCount: totalAttempts,
					principalAccountId: activeRun.principal_account_id || operatorAccountId,
					authRevisionSnapshot: activeRun.auth_revision_snapshot || currentRevision,
					snapshot: createLoopSnapshot(loopMessages, continuationCount, provider.name, assistantCheckpoint)
				})
			}
		}
	} catch (error) {
		logError(error)
		await failRun(
			activeRun.run_id,
			error,
			createLoopSnapshot(loopMessages, continuationCount, provider.name, assistantCheckpoint)
		)
		throw error
	}
}

export function setAgentLoopProviderClientForTesting(nextClient) {
	setProviderClientForTesting('anthropic', nextClient)
}

export function resetAgentLoopProviderClientForTesting() {
	resetProviderClientForTesting('anthropic')
}

export function setAgentLoopTestHooksForTesting(nextHooks = {}) {
	testHooks.afterAssistantMessage = nextHooks.afterAssistantMessage || null
	testHooks.afterToolResult = nextHooks.afterToolResult || null
}

export function resetAgentLoopTestHooksForTesting() {
	testHooks.afterAssistantMessage = null
	testHooks.afterToolResult = null
}

export {
	sendConversationToAgentLoop as sendConversationToClaude,
	setAgentLoopProviderClientForTesting as setClaudeClientForTesting,
	resetAgentLoopProviderClientForTesting as resetClaudeClientForTesting,
	setAgentLoopTestHooksForTesting as setClaudeTestHooksForTesting,
	resetAgentLoopTestHooksForTesting as resetClaudeTestHooksForTesting
}
