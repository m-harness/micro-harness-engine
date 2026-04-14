import { CronJob } from 'cron'
import { appConfig } from './config.js'
import { HttpError } from './http.js'
import {
	nowIso
} from './security.js'
import {
	countActiveAutomationsByUser,
	createAutomation,
	createAutomationRun,
	getAutomationById,
	getUserById,
	hasActiveAutomationRun,
	listActiveAutomations,
	listAutomationsByConversation,
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

function validateCronExpression(expr) {
	if (!expr || typeof expr !== 'string') {
		throw new HttpError(400, 'cronExpression is required for cron schedule.')
	}
	const parts = expr.trim().split(/\s+/)
	if (parts.length !== 5) {
		throw new HttpError(400, 'cronExpression must have exactly 5 fields (minute hour day month weekday).')
	}
	try {
		// Validate by creating a temporary CronJob (prepend seconds field)
		const job = CronJob.from({
			cronTime: `0 ${expr}`,
			onTick: () => {},
			start: false,
			timeZone: appConfig.timezone
		})
		job.stop()
	} catch (error) {
		throw new HttpError(400, `Invalid cron expression: ${error.message}`)
	}
}

function validateScheduledAt(dt) {
	if (!dt || typeof dt !== 'string') {
		throw new HttpError(400, 'scheduledAt is required for once schedule.')
	}
	const date = new Date(dt)
	if (Number.isNaN(date.getTime())) {
		throw new HttpError(400, 'scheduledAt must be a valid ISO date string.')
	}
	if (date.getTime() <= Date.now()) {
		throw new HttpError(400, 'scheduledAt must be a future date/time.')
	}
	return date
}

function computeNextCronRun(expr) {
	try {
		const job = CronJob.from({
			cronTime: `0 ${expr}`,
			onTick: () => {},
			start: false,
			timeZone: appConfig.timezone
		})
		const next = job.nextDate()
		job.stop()
		return next.toISO()
	} catch {
		return null
	}
}

export class AutomationService {
	constructor({ onAutomationTriggered }) {
		this.onAutomationTriggered = onAutomationTriggered
		this.cronJobs = new Map()    // automationId -> CronJob
	}

	startScheduler() {
		// Restore active cron/once automations from DB
		const activeAutomations = listActiveAutomations()
		for (const automation of activeAutomations) {
			if (automation.scheduleKind === 'cron' || automation.scheduleKind === 'once') {
				try {
					this.registerCronJob(automation)
				} catch (error) {
					console.error(`Failed to register CronJob for automation ${automation.id}:`, error?.message || error)
				}
			}
		}
	}

	stopScheduler() {
		for (const [id, job] of this.cronJobs) {
			job.stop()
		}
		this.cronJobs.clear()
	}

	registerCronJob(automation) {
		// Remove existing job if any
		this.unregisterCronJob(automation.id)

		if (automation.scheduleKind === 'cron' && automation.cronExpression) {
			const job = CronJob.from({
				cronTime: `0 ${automation.cronExpression}`,
				onTick: () => {
					this.triggerAutomation(automation.id)
				},
				start: true,
				timeZone: appConfig.timezone
			})
			this.cronJobs.set(automation.id, job)
		} else if (automation.scheduleKind === 'once' && automation.scheduledAt) {
			const scheduledDate = new Date(automation.scheduledAt)
			if (scheduledDate.getTime() <= Date.now()) {
				// Already past – trigger immediately
				this.triggerAutomation(automation.id)
				return
			}
			const job = CronJob.from({
				cronTime: scheduledDate,
				onTick: () => {
					this.triggerAutomation(automation.id)
				},
				start: true,
				timeZone: appConfig.timezone
			})
			this.cronJobs.set(automation.id, job)
		}
	}

	unregisterCronJob(automationId) {
		const job = this.cronJobs.get(automationId)
		if (job) {
			job.stop()
			this.cronJobs.delete(automationId)
		}
	}

	triggerAutomation(automationId) {
		// Re-fetch latest state from DB
		const automation = getAutomationById(automationId)
		if (!automation || automation.status !== 'active') {
			return
		}

		// Skip if a run is already active for this automation
		if (hasActiveAutomationRun(automation.id)) {
			return
		}

		const automationRun = createAutomationRun({
			automationId: automation.id,
			conversationId: automation.conversationId,
			status: 'started'
		})

		try {
			// Update lastRunAt and compute nextRunAt
			const updateFields = {
				id: automation.id,
				lastRunAt: nowIso()
			}

			if (automation.scheduleKind === 'cron' && automation.cronExpression) {
				const nextRun = computeNextCronRun(automation.cronExpression)
				if (nextRun) {
					updateFields.nextRunAt = nextRun
				}
			} else if (automation.scheduleKind === 'once') {
				updateFields.status = 'completed'
				updateFields.nextRunAt = null
				this.unregisterCronJob(automation.id)
			}

			updateAutomation(updateFields)
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

	createAutomationFromTool({
		userId,
		channelIdentityId,
		conversationId,
		name,
		instruction,
		scheduleKind,
		cronExpression,
		scheduledAt
	}) {
		if (!String(name || '').trim()) {
			throw new HttpError(400, 'Automation name is required.')
		}

		if (!String(instruction || '').trim()) {
			throw new HttpError(400, 'Automation instruction is required.')
		}

		// Default to cron if not specified
		const kind = scheduleKind || 'cron'

		// User automation limit check
		const user = getUserById(userId)
		if (user) {
			const count = countActiveAutomationsByUser(userId)
			if (count >= user.maxAutomations) {
				throw new HttpError(403, `Automation limit reached (${user.maxAutomations}). Delete or pause existing automations first.`)
			}
		}

		let normalizedCronExpression = null
		let normalizedScheduledAt = null
		let nextRunAt

		if (kind === 'cron') {
			validateCronExpression(cronExpression)
			normalizedCronExpression = cronExpression.trim()
			nextRunAt = computeNextCronRun(normalizedCronExpression) || nowIso()
		} else if (kind === 'once') {
			const date = validateScheduledAt(scheduledAt)
			normalizedScheduledAt = date.toISOString()
			nextRunAt = normalizedScheduledAt
		} else {
			throw new HttpError(400, 'scheduleKind must be cron or once.')
		}

		const automation = createAutomation({
			ownerUserId: userId,
			channelIdentityId,
			conversationId,
			name: String(name).trim(),
			instruction: String(instruction).trim(),
			scheduleKind: kind,
			intervalMinutes: 0,
			cronExpression: normalizedCronExpression,
			scheduledAt: normalizedScheduledAt,
			nextRunAt
		})

		this.registerCronJob(automation)

		return automation
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
		this.unregisterCronJob(automationId)
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

		const updateFields = {
			id: automationId,
			status: 'active'
		}

		if (automation.scheduleKind === 'cron' && automation.cronExpression) {
			updateFields.nextRunAt = computeNextCronRun(automation.cronExpression) || nowIso()
		} else if (automation.scheduleKind === 'once' && automation.scheduledAt) {
			updateFields.nextRunAt = automation.scheduledAt
		}

		const updated = updateAutomation(updateFields)

		if (updated.scheduleKind === 'cron' || updated.scheduleKind === 'once') {
			this.registerCronJob(updated)
		}

		return updated
	}

	deleteAutomation({
		automationId,
		userId
	}) {
		const automation = getAutomationById(automationId)
		ensureOwnership(automation, userId)
		this.unregisterCronJob(automationId)
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
		this.unregisterCronJob(automationId)
		return updateAutomation({
			id: automationId,
			status: 'paused'
		})
	}

	adminResumeAutomation(automationId) {
		const automation = getAutomationById(automationId)
		if (!automation) {
			throw new HttpError(404, 'Automation not found.')
		}

		const updateFields = {
			id: automationId,
			status: 'active'
		}

		if (automation.scheduleKind === 'cron' && automation.cronExpression) {
			updateFields.nextRunAt = computeNextCronRun(automation.cronExpression) || nowIso()
		} else if (automation.scheduleKind === 'once' && automation.scheduledAt) {
			updateFields.nextRunAt = automation.scheduledAt
		}

		const updated = updateAutomation(updateFields)

		if (updated.scheduleKind === 'cron' || updated.scheduleKind === 'once') {
			this.registerCronJob(updated)
		}

		return updated
	}

	adminDeleteAutomation(automationId) {
		const automation = getAutomationById(automationId)
		if (!automation) {
			throw new HttpError(404, 'Automation not found.')
		}
		this.unregisterCronJob(automationId)
		updateAutomation({
			id: automationId,
			status: 'deleted'
		})
	}

	editAutomationAsUser({
		automationId,
		userId,
		name,
		instruction,
		scheduleKind,
		cronExpression,
		scheduledAt
	}) {
		const automation = getAutomationById(automationId)
		ensureOwnership(automation, userId)
		return this._applyEdit(automation, { name, instruction, scheduleKind, cronExpression, scheduledAt })
	}

	adminEditAutomation(automationId, updates) {
		const automation = getAutomationById(automationId)
		if (!automation) {
			throw new HttpError(404, 'Automation not found.')
		}
		return this._applyEdit(automation, updates)
	}

	_applyEdit(automation, { name, instruction, scheduleKind, cronExpression, scheduledAt }) {
		const updateFields = { id: automation.id }

		if (name !== undefined) {
			if (!String(name).trim()) {
				throw new HttpError(400, 'Automation name is required.')
			}
			updateFields.name = String(name).trim()
		}

		if (instruction !== undefined) {
			if (!String(instruction).trim()) {
				throw new HttpError(400, 'Automation instruction is required.')
			}
			updateFields.instruction = String(instruction).trim()
		}

		const newKind = scheduleKind || automation.scheduleKind

		if (scheduleKind && scheduleKind !== automation.scheduleKind) {
			updateFields.scheduleKind = scheduleKind
		}

		if (newKind === 'cron') {
			const expr = cronExpression || automation.cronExpression
			if (!expr) {
				throw new HttpError(400, 'cronExpression is required for cron schedule.')
			}
			if (cronExpression !== undefined) {
				validateCronExpression(cronExpression)
				updateFields.cronExpression = cronExpression.trim()
			}
			updateFields.nextRunAt = computeNextCronRun(updateFields.cronExpression || expr) || nowIso()
			updateFields.intervalMinutes = 0
			updateFields.scheduledAt = null
		} else if (newKind === 'once') {
			const dt = scheduledAt || automation.scheduledAt
			if (!dt) {
				throw new HttpError(400, 'scheduledAt is required for once schedule.')
			}
			if (scheduledAt !== undefined) {
				validateScheduledAt(scheduledAt)
				updateFields.scheduledAt = new Date(scheduledAt).toISOString()
			}
			updateFields.nextRunAt = updateFields.scheduledAt || dt
			updateFields.intervalMinutes = 0
			updateFields.cronExpression = null
		}

		const updated = updateAutomation(updateFields)

		// Re-register CronJob if schedule changed
		this.unregisterCronJob(automation.id)
		if (updated.status === 'active' && (updated.scheduleKind === 'cron' || updated.scheduleKind === 'once')) {
			this.registerCronJob(updated)
		}

		return updated
	}
}
