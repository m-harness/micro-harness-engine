import { getProvider } from '../providers/index.js'
import {
	createUserTextMessage,
	extractTextFromNormalizedBlocks,
	normalizeConversationMessages
} from '../providers/common.js'
import { appConfig } from './config.js'
import { HttpError } from './http.js'
import { AutomationService } from './automationService.js'
import { PolicyService } from './policyService.js'
import {
	createAgentRun,
	createApproval,
	createConversation,
	createConversationEvent,
	createMessage,
	decideApproval,
	ensureWebChannelIdentity,
	findConversationByExternalRef,
	getAgentRunById,
	getApprovalById,
	getChannelIdentityById,
	getConversationById,
	getOrCreateRemoteUser,
	getUserById,
	getActiveRunForConversation,
	getRecentFailedRunForConversation,
	getRunToolCall,
	listAllRecoverableRuns,
	listAutomationsByConversation,
	listAutomations,
	listConversationsForUser,
	listMessagesByConversation,
	listPendingApprovals,
	listPendingApprovalsByConversation,
	saveRunToolCall,
	updateAgentRun,
	updateConversation
} from './store.js'
import { createToolRegistry } from './tools/registry.js'
import { createSkillRegistry } from './skillRegistry.js'
import { listProtectionRulesApi } from '../protection/api.js'
import { McpManager } from '../mcp/index.js'
import { loadMcpConfig, loadMcpConfigRaw, saveMcpConfig } from '../mcp/config.js'

const MCP_SERVER_NAME_RE = /^[a-zA-Z0-9_-]+$/
const MCP_SERVER_NAME_MAX = 64

function maskObjectValues(obj) {
	if (!obj || typeof obj !== 'object') return obj
	const masked = {}
	for (const key of Object.keys(obj)) {
		masked[key] = '***'
	}
	return masked
}

function maskMcpConfig(config) {
	if (!config || typeof config !== 'object') return config
	const safe = { ...config }
	if (safe.env) safe.env = maskObjectValues(safe.env)
	if (safe.headers) safe.headers = maskObjectValues(safe.headers)
	return safe
}

const MCP_CONFIG_ALLOWED_KEYS = new Set(['command', 'args', 'env', 'headers', 'url', 'transport'])

function validateMcpServerConfig(config) {
	if (!config || typeof config !== 'object' || Array.isArray(config)) {
		throw new HttpError(400, 'Server config must be an object.')
	}
	for (const key of Object.keys(config)) {
		if (!MCP_CONFIG_ALLOWED_KEYS.has(key)) {
			throw new HttpError(400, `Unknown config key: "${key}". Allowed: ${[...MCP_CONFIG_ALLOWED_KEYS].join(', ')}.`)
		}
	}
	if (config.command != null && typeof config.command !== 'string') {
		throw new HttpError(400, 'config.command must be a string.')
	}
	if (config.args != null) {
		if (!Array.isArray(config.args) || !config.args.every(a => typeof a === 'string')) {
			throw new HttpError(400, 'config.args must be an array of strings.')
		}
	}
	if (config.env != null) {
		if (typeof config.env !== 'object' || Array.isArray(config.env)) {
			throw new HttpError(400, 'config.env must be an object.')
		}
	}
	if (config.headers != null) {
		if (typeof config.headers !== 'object' || Array.isArray(config.headers)) {
			throw new HttpError(400, 'config.headers must be an object.')
		}
	}
	if (config.url != null && typeof config.url !== 'string') {
		throw new HttpError(400, 'config.url must be a string.')
	}
	if (config.transport != null && typeof config.transport !== 'string') {
		throw new HttpError(400, 'config.transport must be a string.')
	}
}

function validateMcpServerName(name) {
	if (!name || typeof name !== 'string') {
		throw new HttpError(400, 'Server name is required.')
	}
	if (name.length > MCP_SERVER_NAME_MAX) {
		throw new HttpError(400, `Server name must be at most ${MCP_SERVER_NAME_MAX} characters.`)
	}
	if (!MCP_SERVER_NAME_RE.test(name)) {
		throw new HttpError(400, 'Server name must match [a-zA-Z0-9_-].')
	}
}

function textBlockMessage(role, text) {
	return {
		role,
		content: [
			{
				type: 'text',
				text
			}
		]
	}
}

function safeTitleFromText(text) {
	const normalized = String(text || '').trim().replace(/\s+/g, ' ')
	if (!normalized) {
		return 'Untitled Conversation'
	}
	return normalized.slice(0, 72)
}

function formatToolTrace(toolName, input, result) {
	const inputSummary = (() => {
		try {
			const json = JSON.stringify(input)
			return json.length <= 120 ? json : json.slice(0, 120) + '...'
		} catch {
			return '{}'
		}
	})()
	const outputSummary = (() => {
		try {
			const json = JSON.stringify(result)
			return json.length <= 200 ? json : json.slice(0, 200) + '...'
		} catch {
			return String(result)
		}
	})()
	return `[Tool] ${toolName}(${inputSummary}) -> ${outputSummary}`
}

function isConversationOwner(conversation, actor) {
	return Boolean(
		conversation &&
		actor?.user &&
		(
			conversation.userId === actor.user.id ||
			actor.user.role === 'admin'
		)
	)
}

const RETRYABLE_HTTP_CODES = new Set([429, 500, 502, 503, 504, 529])
const MAX_API_RETRIES = 4
const MAX_RECOVERY_ATTEMPTS = 3

const RETRYABLE_ERROR_PATTERNS = [
	'overloaded',
	'rate_limit',
	'rate limit',
	'capacity',
	'temporarily unavailable',
	'resource_exhausted',
	'quota exceeded',
	'service unavailable',
	'try again'
]

function classifyApiError(error) {
	if (error?.code === 'ETIMEDOUT' || error?.code === 'ECONNRESET' || error?.code === 'UND_ERR_CONNECT_TIMEOUT') {
		return { retryable: true, reason: error.code }
	}
	const status = error?.status || error?.statusCode
	if (status && RETRYABLE_HTTP_CODES.has(status)) {
		return { retryable: true, reason: `HTTP ${status}` }
	}
	if (error?.message?.includes('timeout') || error?.message?.includes('ETIMEDOUT')) {
		return { retryable: true, reason: 'timeout' }
	}
	const message = (error?.message || '').toLowerCase()
	const matchedPattern = RETRYABLE_ERROR_PATTERNS.find(p => message.includes(p))
	if (matchedPattern) {
		return { retryable: true, reason: matchedPattern }
	}
	return { retryable: false, reason: error?.message || String(error) }
}

function classifyToolError(error) {
	const code = error?.code
	if (code === 'ETIMEDOUT' || code === 'EBUSY' || code === 'ECONNRESET') {
		return { retryable: true, reason: code }
	}
	return { retryable: false, reason: error?.message || String(error) }
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

export class MicroHarnessEngineApp {
	constructor() {
		this.provider = getProvider(appConfig.llmProvider)
		this.channelAdapters = new Map()
		this.activeRunLocks = new Set()
		this.activeAbortControllers = new Map()
		this.runEventListeners = new Map()
		this.automationService = new AutomationService({
			onAutomationTriggered: automation => {
				this.enqueueAutomationRun(automation)
			}
		})
		this.toolRegistry = null
		this.mcpManager = new McpManager()
		this.mcpManager.onServerReady = () => {
			this.policyService?.syncSystemPolicies()
		}
		this.policyService = null
		this.skillRegistry = createSkillRegistry()
		this.automationInterval = null
	}

	async init() {
		this.toolRegistry = await createToolRegistry({
			automationService: this.automationService,
			policyService: null
		})
		this.policyService = new PolicyService({
			getToolCatalog: () => [...this.toolRegistry.listTools(), ...this.mcpManager.listTools()]
		})
		this.toolRegistry.setPolicyService(this.policyService)
	}

	registerChannelAdapter(type, adapter) {
		this.channelAdapters.set(type, adapter)
	}

	resolveExternalActor({
		type,
		identityKey,
		displayLabel,
		metadata = {}
	}) {
		return getOrCreateRemoteUser({
			type,
			identityKey,
			displayLabel,
			metadata
		})
	}

	startMcp() {
		// MCPサーバーがreadyになったらポリシーを再同期してツールを許可リストに追加
		this.mcpManager.onServerReady = () => {
			this.policyService.syncSystemPolicies()
		}
		this.mcpManager.start()
		this.policyService.syncSystemPolicies()
	}

	async stopMcp() {
		await this.mcpManager.stop()
	}

	startAutomationScheduler() {
		if (this.automationInterval) {
			return
		}

		this.automationInterval = setInterval(() => {
			this.automationService.pollDueAutomations()
		}, appConfig.automationTickMs)
	}

	stopAutomationScheduler() {
		if (this.automationInterval) {
			clearInterval(this.automationInterval)
			this.automationInterval = null
		}
	}

	// ── Cancel / Abort ──

	cancelRun({ runId, actor }) {
		const run = getAgentRunById(runId)
		if (!run) {
			throw new HttpError(404, 'Run not found.')
		}
		const conversation = getConversationById(run.conversationId)
		if (!isConversationOwner(conversation, actor)) {
			throw new HttpError(404, 'Run not found.')
		}
		if (!['queued', 'running', 'recovering'].includes(run.status)) {
			throw new HttpError(409, `Run is already ${run.status}.`)
		}
		updateAgentRun({
			id: runId,
			status: 'cancelled',
			phase: 'cancelled',
			snapshot: run.snapshot,
			completedAt: new Date().toISOString()
		})
		createConversationEvent({
			conversationId: run.conversationId,
			runId,
			kind: 'run.cancelled',
			payload: {}
		})
		this.activeAbortControllers.get(runId)?.abort()
		this.emitRunEvent(runId, { type: 'run.cancelled', data: { runId, status: 'cancelled' } })
		return { ok: true }
	}

	isRunCancelled(runId) {
		const run = getAgentRunById(runId)
		return !run || run.status === 'cancelled'
	}

	getAbortSignal(runId) {
		return this.activeAbortControllers.get(runId)?.signal
	}

	finalizeCancelledRun(runId, loopMessages, conversation) {
		const lastAssistant = [...loopMessages].reverse().find(m => m.role === 'assistant')
		if (lastAssistant) {
			const partialText = extractTextFromNormalizedBlocks(lastAssistant.content || [])
			if (partialText) {
				createMessage({
					conversationId: conversation.id,
					role: 'assistant',
					contentText: partialText + '\n\n_(中断されました)_',
					content: lastAssistant.content
				})
			}

			const pendingToolCalls = (lastAssistant.content || []).filter(b => b.type === 'tool_call')
			for (const tc of pendingToolCalls) {
				const hasResult = loopMessages.some(m =>
					m.role === 'tool' && m.content?.some(b => b.callId === tc.callId)
				)
				if (!hasResult) {
					loopMessages.push({
						role: 'tool',
						content: [{
							type: 'tool_result',
							callId: tc.callId,
							name: tc.name,
							output: { ok: false, error: 'Run was cancelled by user.' }
						}]
					})
				}
			}
		}

		updateAgentRun({
			id: runId,
			status: 'cancelled',
			phase: 'cancelled',
			snapshot: { loopMessages },
			completedAt: new Date().toISOString()
		})
		createConversationEvent({
			conversationId: conversation.id,
			runId,
			kind: 'run.cancelled',
			payload: {}
		})
		this.emitRunEvent(runId, { type: 'run.cancelled', data: { runId, status: 'cancelled' } })
	}

	// ── SSE Event Emitter ──

	addRunEventListener(conversationId, listener) {
		if (!this.runEventListeners.has(conversationId)) {
			this.runEventListeners.set(conversationId, new Set())
		}
		this.runEventListeners.get(conversationId).add(listener)
	}

	removeRunEventListener(conversationId, listener) {
		this.runEventListeners.get(conversationId)?.delete(listener)
		if (this.runEventListeners.get(conversationId)?.size === 0) {
			this.runEventListeners.delete(conversationId)
		}
	}

	emitRunEvent(runId, event) {
		const run = getAgentRunById(runId)
		if (!run) return
		const listeners = this.runEventListeners.get(run.conversationId)
		if (!listeners) return
		for (const listener of listeners) {
			try { listener(event) } catch {}
		}
	}

	createWebConversation(userId, title = 'New Conversation') {
		const user = getUserById(userId)
		if (!user) {
			throw new HttpError(404, 'User not found.')
		}

		const channelIdentity = ensureWebChannelIdentity(user.id, user.displayName)
		const conversation = createConversation({
			userId: user.id,
			channelIdentityId: channelIdentity.id,
			title: String(title || 'New Conversation').trim() || 'New Conversation',
			source: 'web'
		})
		createConversationEvent({
			conversationId: conversation.id,
			kind: 'conversation.created',
			payload: {
				title: conversation.title,
				source: conversation.source
			}
		})
		return conversation
	}

	listConversationSummaries(userId) {
		return listConversationsForUser(userId)
	}

	getConversationView({
		conversationId,
		actor
	}) {
		const conversation = getConversationById(conversationId)
		if (!isConversationOwner(conversation, actor)) {
			throw new HttpError(404, 'Conversation not found.')
		}

		const activeRun = getActiveRunForConversation(conversation.id)
		return {
			conversation,
			messages: listMessagesByConversation(conversation.id),
			approvals: listPendingApprovalsByConversation(conversation.id),
			automations: listAutomationsByConversation(conversation.id),
			activeRun,
			lastFailedRun: activeRun ? null : getRecentFailedRunForConversation(conversation.id)
		}
	}

	postUserMessage({
		conversationId,
		actor,
		text
	}) {
		const conversation = getConversationById(conversationId)
		if (!isConversationOwner(conversation, actor)) {
			throw new HttpError(404, 'Conversation not found.')
		}

		if (getActiveRunForConversation(conversation.id)) {
			throw new HttpError(409, 'Another run is already active for this conversation.')
		}

		const normalizedText = String(text || '').trim()
		if (!normalizedText) {
			throw new HttpError(400, 'Message text is required.')
		}

		const message = createMessage({
			conversationId: conversation.id,
			role: 'user',
			authorUserId: actor.user.id,
			contentText: normalizedText
		})
		createConversationEvent({
			conversationId: conversation.id,
			kind: 'message.user',
			payload: {
				messageId: message.id,
				text: message.contentText
			}
		})

		if (conversation.title === 'New Conversation' || conversation.title === 'Untitled Conversation') {
			updateConversation({
				id: conversation.id,
				title: safeTitleFromText(normalizedText)
			})
		}

		const run = createAgentRun({
			conversationId: conversation.id,
			triggerType: 'user_message',
			triggerMessageId: message.id,
			providerName: this.provider.name,
			phase: 'queued',
			status: 'queued',
			snapshot: {
				mode: 'new'
			}
		})
		createConversationEvent({
			conversationId: conversation.id,
			runId: run.id,
			kind: 'run.queued',
			payload: {
				runId: run.id,
				triggerType: run.triggerType
			}
		})
		void this.processRun(run.id)
		return {
			message,
			run
		}
	}

	createAutomation({
		conversationId,
		actor,
		name,
		instruction,
		intervalMinutes
	}) {
		const conversation = getConversationById(conversationId)
		if (!isConversationOwner(conversation, actor)) {
			throw new HttpError(404, 'Conversation not found.')
		}

		const automation = this.automationService.createAutomationFromApi({
			userId: actor.user.id,
			channelIdentityId: conversation.channelIdentityId,
			conversationId: conversation.id,
			name,
			instruction,
			intervalMinutes
		})
		createConversationEvent({
			conversationId: conversation.id,
			kind: 'automation.created',
			payload: automation
		})
		return automation
	}

	pauseAutomation({
		automationId,
		actor
	}) {
		return this.automationService.pauseAutomation({
			automationId,
			userId: actor.user.id
		})
	}

	resumeAutomation({
		automationId,
		actor
	}) {
		return this.automationService.resumeAutomation({
			automationId,
			userId: actor.user.id
		})
	}

	deleteAutomation({
		automationId,
		actor
	}) {
		this.automationService.deleteAutomation({
			automationId,
			userId: actor.user.id
		})
	}

	runAutomationNow({
		automationId,
		actor
	}) {
		return this.automationService.runAutomationNow({
			automationId,
			userId: actor.user.id
		})
	}

	listAdminOverview() {
		return this.policyService.getAdminOverview()
	}

	listAdminUsers() {
		return this.policyService.listUsersWithPolicies()
	}

	listAdminToolPolicies() {
		return this.policyService.listToolPoliciesDetailed()
	}

	listAdminFilePolicies() {
		return this.policyService.listFilePoliciesDetailed()
	}

	listAdminProtectionRules() {
		return listProtectionRulesApi().rules
	}

	listAdminApprovals() {
		return listPendingApprovals()
	}

	listAdminAutomations() {
		return listAutomations()
	}

	adminPauseAutomation(automationId) {
		return this.automationService.adminPauseAutomation(automationId)
	}

	adminDeleteAutomation(automationId) {
		this.automationService.adminDeleteAutomation(automationId)
	}

	// --- Skills Admin CRUD ---

	listAdminSkills() {
		return this.skillRegistry.listSkillsDetailed()
	}

	getAdminSkill(name) {
		const detail = this.skillRegistry.getSkillDetail(name)
		if (!detail) {
			throw new HttpError(404, `Skill "${name}" not found.`)
		}
		return detail
	}

	createAdminSkill({ name, description, prompt }) {
		return this.skillRegistry.createSkill({ name, description, prompt })
	}

	updateAdminSkill(name, { description, prompt }) {
		return this.skillRegistry.updateSkill(name, { description, prompt })
	}

	deleteAdminSkill(name) {
		this.skillRegistry.deleteSkill(name)
	}

	// --- MCP Servers Admin CRUD ---

	listAdminMcpServers() {
		const configs = loadMcpConfigRaw()
		const statuses = this.mcpManager.getServerStatuses()
		const statusMap = new Map(statuses.map(s => [s.name, s]))
		return Object.entries(configs).map(([name, config]) => {
			const status = statusMap.get(name)
			return {
				name,
				config: maskMcpConfig(config),
				state: status?.state || 'disconnected',
				toolCount: status?.toolCount || 0,
				lastError: status?.lastError || null
			}
		})
	}

	createAdminMcpServer({ name, config }) {
		validateMcpServerName(name)
		validateMcpServerConfig(config)
		const existing = loadMcpConfigRaw()
		if (existing[name]) {
			throw new HttpError(409, `MCP server "${name}" already exists.`)
		}
		if (!config.command && !config.url) {
			throw new HttpError(400, 'Server config must have "command" or "url".')
		}
		const allConfigs = loadMcpConfig()
		allConfigs.set(name, config)
		saveMcpConfig(allConfigs)
		const status = this.mcpManager.addServer(name, config)
		this.policyService.syncSystemPolicies()
		return status
	}

	async updateAdminMcpServer(name, { config }) {
		validateMcpServerConfig(config)
		const existing = loadMcpConfigRaw()
		if (!existing[name]) {
			throw new HttpError(404, `MCP server "${name}" not found.`)
		}
		if (!config.command && !config.url) {
			throw new HttpError(400, 'Server config must have "command" or "url".')
		}
		const allConfigs = loadMcpConfig()
		allConfigs.set(name, config)
		saveMcpConfig(allConfigs)
		const status = await this.mcpManager.updateServer(name, config)
		this.policyService.syncSystemPolicies()
		return status
	}

	async deleteAdminMcpServer(name) {
		const existing = loadMcpConfigRaw()
		if (!existing[name]) {
			throw new HttpError(404, `MCP server "${name}" not found.`)
		}
		const allConfigs = loadMcpConfig()
		allConfigs.delete(name)
		saveMcpConfig(allConfigs)
		await this.mcpManager.removeServer(name)
		this.policyService.syncSystemPolicies()
	}

	async reconnectAdminMcpServer(name) {
		const configs = loadMcpConfigRaw()
		if (!configs[name]) {
			throw new HttpError(404, `MCP server "${name}" not found.`)
		}
		const status = await this.mcpManager.updateServer(name, configs[name])
		return status
	}

	adminDecideApproval({
		approvalId,
		decision,
		decisionNote = 'admin-console'
	}) {
		const approval = getApprovalById(approvalId)
		if (!approval) {
			throw new HttpError(404, 'Approval not found.')
		}

		const nextStatus = decision === 'approve' ? 'approved' : 'denied'
		const updated = decideApproval({
			approvalId,
			status: nextStatus,
			decidedByUserId: null,
			decisionNote
		})

		if (!updated) {
			throw new HttpError(409, 'This approval request is no longer pending.')
		}

		createConversationEvent({
			conversationId: approval.conversationId,
			runId: approval.runId,
			kind: 'approval.decided',
			payload: {
				approvalId,
				status: nextStatus,
				decisionNote
			}
		})
		void this.resumeRunFromApproval(updated.id)
		return updated
	}

	decideApproval({
		approvalId,
		actor,
		decision
	}) {
		const approval = getApprovalById(approvalId)
		if (!approval) {
			throw new HttpError(404, 'Approval not found.')
		}

		const conversation = getConversationById(approval.conversationId)
		if (!isConversationOwner(conversation, actor)) {
			throw new HttpError(404, 'Approval not found.')
		}

		const nextStatus = decision === 'approve' ? 'approved' : 'denied'
		const updated = decideApproval({
			approvalId,
			status: nextStatus,
			decidedByUserId: actor.user.id
		})

		if (!updated) {
			throw new HttpError(409, 'This approval request is no longer pending.')
		}

		createConversationEvent({
			conversationId: approval.conversationId,
			runId: approval.runId,
			kind: 'approval.decided',
			payload: {
				approvalId,
				status: nextStatus
			}
		})
		void this.resumeRunFromApproval(updated.id)
		return updated
	}

	receiveExternalMessage({
		type,
		identityKey,
		displayLabel,
		externalRef,
		text,
		metadata = {}
	}) {
		const { user, channelIdentity } = this.resolveExternalActor({
			type,
			identityKey,
			displayLabel,
			metadata
		})
		let conversation = findConversationByExternalRef(channelIdentity.id, externalRef)
		if (!conversation) {
			conversation = createConversation({
				userId: user.id,
				channelIdentityId: channelIdentity.id,
				title: safeTitleFromText(text),
				source: type,
				externalRef
			})
			createConversationEvent({
				conversationId: conversation.id,
				kind: 'conversation.created',
				payload: {
					source: type,
					externalRef
				}
			})
		}

		const message = createMessage({
			conversationId: conversation.id,
			role: 'user',
			authorUserId: user.id,
			contentText: text
		})
		createConversationEvent({
			conversationId: conversation.id,
			kind: 'message.user',
			payload: {
				messageId: message.id,
				text
			}
		})

		if (!getActiveRunForConversation(conversation.id)) {
			const run = createAgentRun({
				conversationId: conversation.id,
				triggerType: 'external_message',
				triggerMessageId: message.id,
				providerName: this.provider.name,
				phase: 'queued',
				status: 'queued',
				snapshot: {
					mode: 'new'
				}
			})
			void this.processRun(run.id)
		}

		return {
			user,
			channelIdentity,
			conversation,
			message
		}
	}

	enqueueAutomationRun(automation) {
		const conversation = getConversationById(automation.conversationId)
		if (!conversation || getActiveRunForConversation(conversation.id)) {
			return
		}

		const run = createAgentRun({
			conversationId: conversation.id,
			triggerType: 'automation',
			automationId: automation.id,
			providerName: this.provider.name,
			phase: 'queued',
			status: 'queued',
			snapshot: {
				mode: 'automation',
				extraMessages: [
					createUserTextMessage(automation.instruction)
				]
			}
		})
		createConversationEvent({
			conversationId: conversation.id,
			runId: run.id,
			kind: 'automation.triggered',
			payload: {
				automationId: automation.id,
				name: automation.name
			}
		})
		void this.processRun(run.id)
	}

	async processRun(runId) {
		if (this.activeRunLocks.has(runId)) {
			return
		}

		this.activeRunLocks.add(runId)
		const abortController = new AbortController()
		this.activeAbortControllers.set(runId, abortController)

		try {
			const run = getAgentRunById(runId)
			if (!run) {
				return
			}

			if (run.status !== 'queued' && run.status !== 'running' && run.status !== 'recovering') {
				return
			}

			const conversation = getConversationById(run.conversationId)
			const channelIdentity = getChannelIdentityById(conversation.channelIdentityId)
			const ownerUser = getUserById(conversation.userId)

			let loopMessages = []
			if (run.snapshot?.loopMessages?.length) {
				loopMessages = normalizeConversationMessages(run.snapshot.loopMessages, this.provider.name)
			} else {
				const persistedMessages = listMessagesByConversation(conversation.id).map(message =>
					textBlockMessage(message.role, message.contentText)
				)
				loopMessages = normalizeConversationMessages([
					...persistedMessages,
					...(run.snapshot?.extraMessages || [])
				], this.provider.name)
			}

			const loopGen = this.runLoop({
				run,
				conversation,
				channelIdentity,
				ownerUser,
				loopMessages
			})
			for await (const event of loopGen) {
				this.emitRunEvent(runId, event)
			}
		} catch (error) {
			if (error?.name === 'AbortError') {
				return
			}
			const run = getAgentRunById(runId)
			if (run && run.status !== 'cancelled') {
				const classification = classifyApiError(error)
				const recoveryCount = run.snapshot?.recoveryCount || 0

				if (classification.retryable && recoveryCount < MAX_RECOVERY_ATTEMPTS) {
					updateAgentRun({
						id: run.id,
						status: 'recovering',
						phase: 'recovering',
						snapshot: {
							...run.snapshot,
							recoveryCount: recoveryCount + 1
						},
						lastError: String(error?.message || error)
					})
					createConversationEvent({
						conversationId: run.conversationId,
						runId: run.id,
						kind: 'run.recovering',
						payload: {
							error: String(error?.message || error),
							attempt: recoveryCount + 1
						}
					})
				} else {
					updateAgentRun({
						id: run.id,
						status: 'failed',
						phase: 'failed',
						snapshot: run.snapshot,
						lastError: String(error?.message || error),
						completedAt: new Date().toISOString()
					})
					createConversationEvent({
						conversationId: run.conversationId,
						runId: run.id,
						kind: 'run.failed',
						payload: {
							error: String(error?.message || error)
						}
					})
					this.emitRunEvent(runId, { type: 'run.failed', data: { runId: run.id, error: String(error?.message || error) } })
				}
			}
		} finally {
			this.activeAbortControllers.delete(runId)
			this.activeRunLocks.delete(runId)
		}
	}

	async resumeRunFromApproval(approvalId) {
		const approval = getApprovalById(approvalId)
		if (!approval) {
			return
		}

		const run = getAgentRunById(approval.runId)
		if (!run || run.status !== 'waiting_approval') {
			return
		}

		const conversation = getConversationById(run.conversationId)
		const channelIdentity = getChannelIdentityById(conversation.channelIdentityId)
		const ownerUser = getUserById(conversation.userId)
		const pendingTool = run.snapshot?.pendingTool

		if (!pendingTool) {
			return
		}

		const loopMessages = normalizeConversationMessages(run.snapshot.loopMessages || [], this.provider.name)
		let toolResult
		if (approval.status !== 'approved') {
			toolResult = {
				ok: false,
				cancelled: true,
				message: 'Human approval was denied.'
			}
		} else if (this.mcpManager.isMcpTool(pendingTool.name)) {
			toolResult = await this.mcpManager.executeTool(pendingTool.name, approval.toolInput)
		} else {
			toolResult = await this.toolRegistry.execute(pendingTool.name, approval.toolInput, {
				approvalGranted: true,
				userId: ownerUser.id,
				conversationId: conversation.id,
				channelIdentityId: channelIdentity.id
			})
		}

		loopMessages.push({
			role: 'tool',
			content: [
				{
					type: 'tool_result',
					callId: pendingTool.callId,
					name: pendingTool.name,
					output: toolResult
				}
			]
		})

		updateAgentRun({
			id: run.id,
			status: 'running',
			phase: 'approval_resumed',
			snapshot: {
				loopMessages,
				mode: run.snapshot?.mode || 'new'
			}
		})

		const loopGen = this.runLoop({
			run: getAgentRunById(run.id),
			conversation,
			channelIdentity,
			ownerUser,
			loopMessages
		})
		for await (const event of loopGen) {
			this.emitRunEvent(run.id, event)
		}
	}

	async *runLoop({
		run,
		conversation,
		channelIdentity,
		ownerUser,
		loopMessages
	}) {
		const runId = run.id
		const mode = run.snapshot?.mode || 'new'

		updateAgentRun({
			id: runId,
			status: 'running',
			phase: 'calling_model',
			snapshot: { loopMessages, mode }
		})
		createConversationEvent({
			conversationId: conversation.id,
			runId,
			kind: 'run.started',
			payload: { runId }
		})
		yield { type: 'run.started', data: { runId, status: 'running', phase: 'calling_model' } }

		while (true) {
			// ── checkpoint 1: loop top ──
			if (this.isRunCancelled(runId)) {
				this.finalizeCancelledRun(runId, loopMessages, conversation)
				return
			}

			const allDefs = [...this.toolRegistry.getDefinitions(), ...this.mcpManager.getToolDefinitions()]
			const policyTools = this.policyService.listAllowedToolDefinitions(
				ownerUser.id,
				allDefs
			)
			const skillDef = this.skillRegistry?.getUseSkillDefinition()
			const toolDefinitions = skillDef ? [...policyTools, skillDef] : policyTools

			let result
			for (let attempt = 0; attempt < MAX_API_RETRIES; attempt++) {
				try {
					const signal = this.getAbortSignal(runId)
					const genStream = this.provider.generate({
						messages: loopMessages,
						systemPrompt: this.buildSystemPrompt({
							user: ownerUser,
							hasTools: toolDefinitions.length > 0
						}),
						toolDefinitions,
						maxTokens: appConfig.maxTokens,
						signal
					})

					// consume async generator (streaming providers) or plain promise (legacy)
					if (genStream && typeof genStream[Symbol.asyncIterator] === 'function') {
						for await (const delta of genStream) {
							yield { type: 'delta', data: { runId, ...delta } }
						}
						// The generator's return value holds the final assembled result
						// We need to re-call to get the return – async generators expose it via .next() after done
						// Instead, the provider accumulates internally and we get result from the last yield
						// Actually, async generators return via { value, done:true } – but for-await doesn't capture it.
						// So providers set this.lastResult during iteration.
						result = genStream.result
					} else {
						result = await genStream
					}
					break
				} catch (apiError) {
					if (apiError?.name === 'AbortError') {
						this.finalizeCancelledRun(runId, loopMessages, conversation)
						return
					}
					const { retryable } = classifyApiError(apiError)
					if (!retryable || attempt >= MAX_API_RETRIES - 1) {
						throw apiError
					}
					await sleep(500 * Math.pow(2, attempt))
				}
			}

			// ── checkpoint 2: after LLM response ──
			if (this.isRunCancelled(runId)) {
				this.finalizeCancelledRun(runId, loopMessages, conversation)
				return
			}

			loopMessages.push(result.assistantMessage)

			updateAgentRun({
				id: runId,
				status: 'running',
				phase: 'processing_response',
				snapshot: { loopMessages, mode }
			})
			const assistantText = result.assistantText || extractTextFromNormalizedBlocks(result.assistantMessage.content || [])
			const toolCalls = (result.assistantMessage.content || []).filter(block => block.type === 'tool_call')

			if (toolCalls.length === 0) {
				const finalText = assistantText || 'Done.'
				const message = createMessage({
					conversationId: conversation.id,
					role: 'assistant',
					contentText: finalText,
					content: result.assistantMessage.content
				})
				createConversationEvent({
					conversationId: conversation.id,
					runId,
					kind: 'message.assistant',
					payload: {
						messageId: message.id,
						text: finalText
					}
				})
				updateAgentRun({
					id: runId,
					status: 'completed',
					phase: 'completed',
					snapshot: { loopMessages, mode },
					completedAt: new Date().toISOString()
				})
				await this.deliverAssistantMessage(conversation, channelIdentity, finalText)
				yield { type: 'run.completed', data: { runId, status: 'completed', finalText } }
				return
			}

			for (const toolCall of toolCalls) {
				// ── checkpoint 3: before each tool ──
				if (this.isRunCancelled(runId)) {
					this.finalizeCancelledRun(runId, loopMessages, conversation)
					return
				}

				yield { type: 'tool_call', data: { runId, name: toolCall.name, input: toolCall.input } }

				let toolResult

				const cached = getRunToolCall(run.id, toolCall.callId)
				if (cached && cached.status === 'success' && cached.outputJson) {
					try {
						toolResult = JSON.parse(cached.outputJson)
					} catch {
						toolResult = { ok: true, cached: true }
					}
				} else {
					saveRunToolCall({
						runId: run.id,
						toolUseId: toolCall.callId,
						toolName: toolCall.name,
						inputJson: JSON.stringify(toolCall.input ?? {}),
						status: 'started'
					})

					try {
						if (toolCall.name === 'use_skill') {
							toolResult = this.executeSkill(toolCall.input)
						} else if (this.mcpManager.isMcpTool(toolCall.name)) {
							toolResult = await this.mcpManager.executeTool(toolCall.name, toolCall.input)
						} else {
							toolResult = await this.toolRegistry.execute(toolCall.name, toolCall.input, {
								approvalGranted: false,
								userId: ownerUser.id,
								conversationId: conversation.id,
								channelIdentityId: channelIdentity.id
							})
						}

						saveRunToolCall({
							runId: run.id,
							toolUseId: toolCall.callId,
							toolName: toolCall.name,
							outputJson: JSON.stringify(toolResult ?? {}),
							status: 'success',
							completedAt: new Date().toISOString()
						})
					} catch (toolError) {
						saveRunToolCall({
							runId: run.id,
							toolUseId: toolCall.callId,
							toolName: toolCall.name,
							status: 'error',
							errorText: String(toolError?.message || toolError),
							completedAt: new Date().toISOString()
						})
						toolResult = {
							ok: false,
							error: toolError?.message || String(toolError)
						}
					}
				}

				if (toolResult?.approvalRequired) {
					const approval = createApproval({
						conversationId: conversation.id,
						runId: run.id,
						requesterUserId: ownerUser.id,
						channelIdentityId: channelIdentity.id,
						toolName: toolCall.name,
						toolInput: toolCall.input,
						reason: toolResult.reason || 'This tool requires human approval.'
					})
					createConversationEvent({
						conversationId: conversation.id,
						runId: run.id,
						kind: 'approval.requested',
						payload: approval
					})
					updateAgentRun({
						id: run.id,
						status: 'waiting_approval',
						phase: 'waiting_approval',
						snapshot: {
							loopMessages,
							mode,
							pendingTool: {
								callId: toolCall.callId,
								name: toolCall.name,
								input: toolCall.input
							}
						}
					})
					await this.deliverApprovalRequest(conversation, channelIdentity, approval)
					yield { type: 'approval.requested', data: { runId: run.id, approvalId: approval.id, toolName: toolCall.name } }
					return
				}

				createConversationEvent({
					conversationId: conversation.id,
					runId: run.id,
					kind: 'tool.result',
					payload: {
						toolName: toolCall.name,
						output: toolResult
					}
				})
				createMessage({
					conversationId: conversation.id,
					role: 'tool',
					contentText: formatToolTrace(toolCall.name, toolCall.input, toolResult)
				})
				loopMessages.push({
					role: 'tool',
					content: [
						{
							type: 'tool_result',
							callId: toolCall.callId,
							name: toolCall.name,
							output: toolResult
						}
					]
				})

				yield { type: 'tool_result', data: { runId: run.id, name: toolCall.name, output: toolResult } }
			}

			// ── checkpoint 4: after all tools ──
			if (this.isRunCancelled(runId)) {
				this.finalizeCancelledRun(runId, loopMessages, conversation)
				return
			}

			updateAgentRun({
				id: runId,
				status: 'running',
				phase: 'tool_results',
				snapshot: { loopMessages, mode }
			})
		}
	}

	async recoverInterruptedRuns() {
		const runs = listAllRecoverableRuns()
		for (const run of runs) {
			try {
				await this.processRun(run.id)
			} catch (error) {
				console.error(`Recovery failed for run ${run.id}:`, error?.message || error)
			}
		}
	}

	executeSkill(input) {
		if (!this.skillRegistry) {
			return { ok: false, error: 'No skills available.' }
		}
		const skillName = String(input?.skill_name || '').trim()
		const skill = this.skillRegistry.getSkill(skillName)
		if (!skill) {
			return {
				ok: false,
				error: `Unknown skill: "${skillName}".`,
				availableSkills: this.skillRegistry.getSkillNames()
			}
		}
		return { ok: true, skill: skill.name, instructions: skill.prompt }
	}

	buildSystemPrompt({ user, hasTools = true }) {
		const lines = [
			'You are microHarnessEngine, a secure multi-channel AI agent.',
			'You are operating in a private 1:1 conversation with one user.',
			'Use the provided tools when you need filesystem access or automation changes.',
			'Never invent tool results.',
			'If a destructive action requires approval, wait for the approval workflow instead of pretending it completed.',
			'Automations belong only to the current user and current conversation.',
			`Current user display name: ${user?.displayName || 'unknown'}.`,
			`Project root: ${appConfig.projectRoot}`
		]

		if (!hasTools) {
			lines.push(
				'No tools are currently available to you.',
				'You can still answer questions and provide guidance, but you cannot inspect files, change files, or perform any external action yourself.',
				'If the user wants an operation performed, explain the steps clearly and ask the user to do it manually.'
			)
		}

		const externalRoots = this.policyService.getExternalRoots(user.id)
		if (externalRoots.length > 0) {
			lines.push('')
			lines.push('## Allowlisted External Directories')
			lines.push('The following external paths are accessible via filesystem tools:')
			for (const root of externalRoots) {
				lines.push(`- ${root.rootPath} (${root.pathType})`)
			}
		}

		const mcpServers = this.mcpManager.getConnectedServerNames()
		if (mcpServers.length > 0) {
			lines.push('')
			lines.push(`## Connected MCP Servers`)
			lines.push(`The following external tool servers are connected: ${mcpServers.join(', ')}.`)
			lines.push('MCP tools are prefixed with the server name (e.g. servername__toolname).')
		}

		if (this.skillRegistry) {
			const skills = this.skillRegistry.listSkills()
			if (skills.length > 0) {
				lines.push('')
				lines.push('## Available Skills')
				lines.push('Use the use_skill tool to activate a skill when the task matches:')
				for (const skill of skills) {
					lines.push(`- ${skill.name}: ${skill.description}`)
				}
			}
		}

		return lines.join('\n')
	}

	async deliverAssistantMessage(conversation, channelIdentity, text) {
		const adapter = this.channelAdapters.get(channelIdentity.type)
		if (!adapter || typeof adapter.sendAssistantMessage !== 'function') {
			return
		}

		await adapter.sendAssistantMessage({
			conversation,
			channelIdentity,
			text
		})
	}

	async deliverApprovalRequest(conversation, channelIdentity, approval) {
		const adapter = this.channelAdapters.get(channelIdentity.type)
		if (!adapter || typeof adapter.sendApprovalRequest !== 'function') {
			return
		}

		await adapter.sendApprovalRequest({
			conversation,
			channelIdentity,
			approval
		})
	}
}
