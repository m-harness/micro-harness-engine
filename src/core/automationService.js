import { HttpError } from './http.js'
import {
	addMinutes,
	nowIso
} from './security.js'
import {
	createAutomation,
	createAutomationRun,
	getAutomationById,
	listAutomationsByConversation,
	listDueAutomations,
	updateAutomation,
	completeAutomationRun
} from './store.js'

function ensureOwnership(automation, userId) {
	if (!automation) {
		throw new HttpError(404, 'Automation not found.')
	}

	if (automation.ownerUserId !== userId) {
		throw new HttpError(403, 'You do not control this automation.')
	}
}

function normalizeIntervalMinutes(value) {
	const parsed = Number.parseInt(String(value ?? ''), 10)
	if (!Number.isInteger(parsed) || parsed < 5) {
		throw new HttpError(400, 'intervalMinutes must be an integer of at least 5.')
	}
	return parsed
}

export class AutomationService {
	constructor({ onAutomationTriggered }) {
		this.onAutomationTriggered = onAutomationTriggered
	}

	createAutomationFromTool({
		userId,
		channelIdentityId,
		conversationId,
		name,
		instruction,
		intervalMinutes
	}) {
		if (!String(name || '').trim()) {
			throw new HttpError(400, 'Automation name is required.')
		}

		if (!String(instruction || '').trim()) {
			throw new HttpError(400, 'Automation instruction is required.')
		}

		const normalizedInterval = normalizeIntervalMinutes(intervalMinutes)
		return createAutomation({
			ownerUserId: userId,
			channelIdentityId,
			conversationId,
			name: String(name).trim(),
			instruction: String(instruction).trim(),
			intervalMinutes: normalizedInterval,
			nextRunAt: addMinutes(new Date(), normalizedInterval).toISOString()
		})
	}

	listAutomationsForConversation(conversationId) {
		return listAutomationsByConversation(conversationId)
	}

	createAutomationFromApi(payload) {
		return this.createAutomationFromTool(payload)
	}

	pauseAutomation({
		automationId,
		userId
	}) {
		const automation = getAutomationById(automationId)
		ensureOwnership(automation, userId)
		return updateAutomation({
			id: automationId,
			status: 'paused'
		})
	}

	resumeAutomation({
		automationId,
		userId
	}) {
		const automation = getAutomationById(automationId)
		ensureOwnership(automation, userId)
		return updateAutomation({
			id: automationId,
			status: 'active',
			nextRunAt: addMinutes(new Date(), automation.intervalMinutes).toISOString()
		})
	}

	deleteAutomation({
		automationId,
		userId
	}) {
		const automation = getAutomationById(automationId)
		ensureOwnership(automation, userId)
		updateAutomation({
			id: automationId,
			status: 'deleted'
		})
	}

	runAutomationNow({
		automationId,
		userId
	}) {
		const automation = getAutomationById(automationId)
		ensureOwnership(automation, userId)
		this.onAutomationTriggered(automation)
		return automation
	}

	adminPauseAutomation(automationId) {
		const automation = getAutomationById(automationId)
		if (!automation) {
			throw new HttpError(404, 'Automation not found.')
		}
		return updateAutomation({
			id: automationId,
			status: 'paused'
		})
	}

	adminDeleteAutomation(automationId) {
		const automation = getAutomationById(automationId)
		if (!automation) {
			throw new HttpError(404, 'Automation not found.')
		}
		updateAutomation({
			id: automationId,
			status: 'deleted'
		})
	}

	pollDueAutomations(limit = 20) {
		for (const automation of listDueAutomations(limit, nowIso())) {
			if (automation.status !== 'active') {
				continue
			}

			const automationRun = createAutomationRun({
				automationId: automation.id,
				conversationId: automation.conversationId,
				status: 'started'
			})

			try {
				updateAutomation({
					id: automation.id,
					lastRunAt: nowIso(),
					nextRunAt: addMinutes(new Date(), automation.intervalMinutes).toISOString()
				})
				this.onAutomationTriggered(automation, automationRun)
				completeAutomationRun({
					automationRunId: automationRun.id,
					status: 'queued'
				})
			} catch (error) {
				completeAutomationRun({
					automationRunId: automationRun.id,
					status: 'failed',
					errorText: String(error?.message || error)
				})
			}
		}
	}
}
