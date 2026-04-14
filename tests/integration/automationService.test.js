import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createTempDir, removeTempDir, setupTestEnv } from '../helpers/setup.js'

let tempDir
let AutomationService
let AuthService
let storeFns
let createAutomationTool
let editAutomationTool

beforeAll(async () => {
	tempDir = createTempDir('mhe-automation-')
	setupTestEnv(tempDir)

	const autoMod = await import(
		pathToFileURL(path.resolve('src/core/automationService.js')).href
	)
	AutomationService = autoMod.AutomationService

	const authMod = await import(
		pathToFileURL(path.resolve('src/core/authService.js')).href
	)
	AuthService = authMod.AuthService

	storeFns = await import(
		pathToFileURL(path.resolve('src/core/store.js')).href
	)

	const createToolMod = await import(
		pathToFileURL(path.resolve('tools/automation/createAutomation.js')).href
	)
	createAutomationTool = createToolMod.createAutomationTool

	const editToolMod = await import(
		pathToFileURL(path.resolve('tools/automation/editAutomation.js')).href
	)
	editAutomationTool = editToolMod.editAutomationTool
})

afterAll(() => {
	removeTempDir(tempDir)
})

describe('AutomationService', () => {
	let automationService
	let authService
	let rootUserId
	let conversationId
	let channelIdentityId
	const triggeredAutomations = []

	beforeAll(() => {
		automationService = new AutomationService({
			onAutomationTriggered: (automation) => {
				triggeredAutomations.push(automation)
			}
		})
		authService = new AuthService()

		const login = authService.loginLocalUser({
			loginName: 'root',
			password: process.env.ADMIN_RUNTIME_PASSWORD
		})
		rootUserId = login.user.id

		// Create a channel identity and conversation for testing
		const identity = storeFns.ensureWebChannelIdentity(rootUserId, 'Root')
		channelIdentityId = identity.id
		const convo = storeFns.createConversation({
			userId: rootUserId,
			channelIdentityId,
			title: 'Test Conversation',
			source: 'web'
		})
		conversationId = convo.id
	})

	describe('createAutomationFromTool', () => {
		it('creates cron automation with correct fields', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Daily Check',
				instruction: 'Check for updates',
				scheduleKind: 'cron',
				cronExpression: '*/10 * * * *'
			})
			expect(automation.id).toBeTruthy()
			expect(automation.name).toBe('Daily Check')
			expect(automation.scheduleKind).toBe('cron')
			expect(automation.cronExpression).toBe('*/10 * * * *')
			expect(automation.status).toBe('active')
			expect(automation.nextRunAt).toBeTruthy()
			automationService.unregisterCronJob(automation.id)
		})

		it('defaults to cron schedule kind', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Default Kind',
				instruction: 'Check for updates',
				cronExpression: '0 9 * * *'
			})
			expect(automation.scheduleKind).toBe('cron')
			automationService.unregisterCronJob(automation.id)
		})

		it('rejects empty name', () => {
			expect(() => {
				automationService.createAutomationFromTool({
					userId: rootUserId,
					channelIdentityId,
					conversationId,
					name: '',
					instruction: 'Do something',
					scheduleKind: 'cron',
					cronExpression: '0 9 * * *'
				})
			}).toThrow(/400|name/i)
		})

		it('rejects empty instruction', () => {
			expect(() => {
				automationService.createAutomationFromTool({
					userId: rootUserId,
					channelIdentityId,
					conversationId,
					name: 'No Instruction',
					instruction: '',
					scheduleKind: 'cron',
					cronExpression: '0 9 * * *'
				})
			}).toThrow(/400|instruction/i)
		})

		// D1: cron with cronExpression=null
		it('rejects cron schedule with null cronExpression', () => {
			expect(() => {
				automationService.createAutomationFromTool({
					userId: rootUserId,
					channelIdentityId,
					conversationId,
					name: 'Cron Null',
					instruction: 'Do something',
					scheduleKind: 'cron',
					cronExpression: null
				})
			}).toThrow(/400|cronExpression/i)
		})

		// D2: once with invalid scheduledAt
		it('rejects once schedule with invalid ISO date', () => {
			expect(() => {
				automationService.createAutomationFromTool({
					userId: rootUserId,
					channelIdentityId,
					conversationId,
					name: 'Bad Date',
					instruction: 'Do something',
					scheduleKind: 'once',
					scheduledAt: 'not-a-date'
				})
			}).toThrow(/400|valid ISO|future/i)
		})

		// D3: invalid scheduleKind
		it('rejects invalid scheduleKind', () => {
			expect(() => {
				automationService.createAutomationFromTool({
					userId: rootUserId,
					channelIdentityId,
					conversationId,
					name: 'Bad Kind',
					instruction: 'Do something',
					scheduleKind: 'interval'
				})
			}).toThrow(/400|scheduleKind/i)
		})
	})

	describe('cron schedule', () => {
		it('creates automation with cron expression', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Cron Job',
				instruction: 'Run at 9am daily',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			expect(automation.id).toBeTruthy()
			expect(automation.scheduleKind).toBe('cron')
			expect(automation.cronExpression).toBe('0 9 * * *')
			expect(automation.intervalMinutes).toBe(0)
			expect(automation.nextRunAt).toBeTruthy()
			automationService.unregisterCronJob(automation.id)
		})

		it('rejects invalid cron expression', () => {
			expect(() => {
				automationService.createAutomationFromTool({
					userId: rootUserId,
					channelIdentityId,
					conversationId,
					name: 'Bad Cron',
					instruction: 'Run',
					scheduleKind: 'cron',
					cronExpression: 'not valid cron'
				})
			}).toThrow(/400|cron/i)
		})

		it('rejects cron with wrong number of fields', () => {
			expect(() => {
				automationService.createAutomationFromTool({
					userId: rootUserId,
					channelIdentityId,
					conversationId,
					name: 'Bad Fields',
					instruction: 'Run',
					scheduleKind: 'cron',
					cronExpression: '* * *'
				})
			}).toThrow(/400|5 fields/i)
		})
	})

	describe('once schedule', () => {
		it('creates automation with scheduled_at', () => {
			const futureDate = new Date(Date.now() + 3600_000).toISOString()
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'One Shot',
				instruction: 'Run once',
				scheduleKind: 'once',
				scheduledAt: futureDate
			})
			expect(automation.id).toBeTruthy()
			expect(automation.scheduleKind).toBe('once')
			expect(automation.scheduledAt).toBeTruthy()
			expect(automation.intervalMinutes).toBe(0)
			automationService.unregisterCronJob(automation.id)
		})

		it('rejects past scheduledAt', () => {
			const pastDate = new Date(Date.now() - 3600_000).toISOString()
			expect(() => {
				automationService.createAutomationFromTool({
					userId: rootUserId,
					channelIdentityId,
					conversationId,
					name: 'Past Shot',
					instruction: 'Run once',
					scheduleKind: 'once',
					scheduledAt: pastDate
				})
			}).toThrow(/400|future/i)
		})
	})

	describe('user automation limit', () => {
		it('rejects when user exceeds max automations', () => {
			storeFns.updateUserMaxAutomations(rootUserId, 2)
			const existingActive = storeFns.countActiveAutomationsByUser(rootUserId)

			const needed = Math.max(0, 2 - existingActive)
			for (let i = 0; i < needed; i++) {
				const a = automationService.createAutomationFromTool({
					userId: rootUserId,
					channelIdentityId,
					conversationId,
					name: `Limit Test ${i}`,
					instruction: 'Fill limit',
					scheduleKind: 'cron',
					cronExpression: '0 9 * * *'
				})
				automationService.unregisterCronJob(a.id)
			}

			expect(() => {
				automationService.createAutomationFromTool({
					userId: rootUserId,
					channelIdentityId,
					conversationId,
					name: 'Over Limit',
					instruction: 'Should fail',
					scheduleKind: 'cron',
					cronExpression: '0 9 * * *'
				})
			}).toThrow(/403|limit/i)

			storeFns.updateUserMaxAutomations(rootUserId, 100)
		})
	})

	describe('skip active runs', () => {
		it('skips triggerAutomation when active run exists', () => {
			const automation = storeFns.createAutomation({
				ownerUserId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Skip Test',
				instruction: 'Skip me',
				scheduleKind: 'cron',
				intervalMinutes: 0,
				cronExpression: '*/5 * * * *',
				nextRunAt: new Date(Date.now() - 60000).toISOString()
			})

			storeFns.createAgentRun({
				conversationId,
				triggerType: 'automation',
				automationId: automation.id,
				providerName: 'test',
				phase: 'running',
				status: 'running',
				snapshot: {}
			})

			const countBefore = triggeredAutomations.length
			automationService.triggerAutomation(automation.id)
			expect(triggeredAutomations.length).toBe(countBefore)
		})

		it('skips when waiting_approval run exists', () => {
			const automation = storeFns.createAutomation({
				ownerUserId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Approval Skip',
				instruction: 'Waiting approval',
				scheduleKind: 'cron',
				intervalMinutes: 0,
				cronExpression: '*/5 * * * *',
				nextRunAt: new Date(Date.now() - 60000).toISOString()
			})

			storeFns.createAgentRun({
				conversationId,
				triggerType: 'automation',
				automationId: automation.id,
				providerName: 'test',
				phase: 'waiting_approval',
				status: 'waiting_approval',
				snapshot: {}
			})

			const countBefore = triggeredAutomations.length
			automationService.triggerAutomation(automation.id)
			expect(triggeredAutomations.length).toBe(countBefore)
		})
	})

	describe('editAutomation - _applyEdit', () => {
		it('edits name and instruction', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Editable',
				instruction: 'Original instruction',
				scheduleKind: 'cron',
				cronExpression: '*/10 * * * *'
			})
			automationService.unregisterCronJob(automation.id)

			const updated = automationService.editAutomationAsUser({
				automationId: automation.id,
				userId: rootUserId,
				name: 'Updated Name',
				instruction: 'Updated instruction'
			})

			expect(updated.name).toBe('Updated Name')
			expect(updated.instruction).toBe('Updated instruction')
		})

		it('changes cron expression', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Cron Change',
				instruction: 'Change me',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)

			const updated = automationService.editAutomationAsUser({
				automationId: automation.id,
				userId: rootUserId,
				cronExpression: '30 8 * * 1-5'
			})

			expect(updated.scheduleKind).toBe('cron')
			expect(updated.cronExpression).toBe('30 8 * * 1-5')
			automationService.unregisterCronJob(automation.id)
		})

		it('rejects edit by non-owner', () => {
			const user = authService.createLocalUser({
				loginName: 'edituser1',
				password: 'LongPassword12!',
				displayName: 'Edit User'
			})
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Not Editable',
				instruction: 'Check stuff',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)
			expect(() => {
				automationService.editAutomationAsUser({
					automationId: automation.id,
					userId: user.id,
					name: 'Hacked Name'
				})
			}).toThrow(/403|do not control/i)
		})

		it('rejects editing name to empty string', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'A1 Test',
				instruction: 'Check stuff',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)
			expect(() => {
				automationService.editAutomationAsUser({
					automationId: automation.id,
					userId: rootUserId,
					name: ''
				})
			}).toThrow(/400|name/i)
		})

		it('rejects editing instruction to empty string', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'A2 Test',
				instruction: 'Check stuff',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)
			expect(() => {
				automationService.editAutomationAsUser({
					automationId: automation.id,
					userId: rootUserId,
					instruction: ''
				})
			}).toThrow(/400|instruction/i)
		})

		it('rejects switching to cron without cronExpression', () => {
			const futureDate = new Date(Date.now() + 3600_000).toISOString()
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'A3 Test',
				instruction: 'Check stuff',
				scheduleKind: 'once',
				scheduledAt: futureDate
			})
			automationService.unregisterCronJob(automation.id)
			expect(() => {
				automationService.editAutomationAsUser({
					automationId: automation.id,
					userId: rootUserId,
					scheduleKind: 'cron'
				})
			}).toThrow(/400|cronExpression/i)
		})

		it('switches from cron to once with scheduledAt', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'A4 Test',
				instruction: 'Check stuff',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)

			const futureDate = new Date(Date.now() + 3600_000).toISOString()
			const updated = automationService.editAutomationAsUser({
				automationId: automation.id,
				userId: rootUserId,
				scheduleKind: 'once',
				scheduledAt: futureDate
			})
			expect(updated.scheduleKind).toBe('once')
			expect(updated.cronExpression).toBeNull()
			expect(updated.scheduledAt).toBeTruthy()
			automationService.unregisterCronJob(automation.id)
		})

		it('rejects switching to once without scheduledAt', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'A5 Test',
				instruction: 'Check stuff',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)
			expect(() => {
				automationService.editAutomationAsUser({
					automationId: automation.id,
					userId: rootUserId,
					scheduleKind: 'once'
				})
			}).toThrow(/400|scheduledAt/i)
		})

		it('switches from once to cron', () => {
			const futureDate = new Date(Date.now() + 3600_000).toISOString()
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'A8 Test',
				instruction: 'Check stuff',
				scheduleKind: 'once',
				scheduledAt: futureDate
			})
			automationService.unregisterCronJob(automation.id)

			const updated = automationService.editAutomationAsUser({
				automationId: automation.id,
				userId: rootUserId,
				scheduleKind: 'cron',
				cronExpression: '0 12 * * *'
			})
			expect(updated.scheduleKind).toBe('cron')
			expect(updated.scheduledAt).toBeNull()
			expect(updated.cronExpression).toBe('0 12 * * *')
			automationService.unregisterCronJob(automation.id)
		})
	})

	describe('triggerAutomation', () => {
		it('does nothing for nonexistent automationId', () => {
			const countBefore = triggeredAutomations.length
			automationService.triggerAutomation('nonexistent-id-12345')
			expect(triggeredAutomations.length).toBe(countBefore)
		})

		it('does not trigger paused automation', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'B2 Paused',
				instruction: 'Should not fire',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.pauseAutomation({
				automationId: automation.id,
				userId: rootUserId
			})

			const countBefore = triggeredAutomations.length
			automationService.triggerAutomation(automation.id)
			expect(triggeredAutomations.length).toBe(countBefore)
		})

		it('does not trigger deleted automation', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'B3 Deleted',
				instruction: 'Should not fire',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.deleteAutomation({
				automationId: automation.id,
				userId: rootUserId
			})

			const countBefore = triggeredAutomations.length
			automationService.triggerAutomation(automation.id)
			expect(triggeredAutomations.length).toBe(countBefore)
		})

		it('updates nextRunAt with computeNextCronRun for cron automation', () => {
			const automation = storeFns.createAutomation({
				ownerUserId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'B4 Cron Trigger',
				instruction: 'Cron trigger test',
				scheduleKind: 'cron',
				intervalMinutes: 0,
				cronExpression: '0 9 * * *',
				nextRunAt: new Date(Date.now() - 60000).toISOString()
			})

			const countBefore = triggeredAutomations.length
			automationService.triggerAutomation(automation.id)
			expect(triggeredAutomations.length).toBe(countBefore + 1)

			const updated = storeFns.getAutomationById(automation.id)
			expect(updated.lastRunAt).toBeTruthy()
			expect(new Date(updated.nextRunAt).getTime()).toBeGreaterThan(Date.now())
		})

		it('handles exception from onAutomationTriggered callback', () => {
			const throwingService = new AutomationService({
				onAutomationTriggered: () => {
					throw new Error('Callback exploded!')
				}
			})

			const automation = storeFns.createAutomation({
				ownerUserId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'B5 Throw Test',
				instruction: 'Should handle error',
				scheduleKind: 'cron',
				intervalMinutes: 0,
				cronExpression: '*/5 * * * *',
				nextRunAt: new Date(Date.now() - 60000).toISOString()
			})

			expect(() => {
				throwingService.triggerAutomation(automation.id)
			}).not.toThrow()

			const updated = storeFns.getAutomationById(automation.id)
			expect(updated.lastRunAt).toBeTruthy()
		})
	})

	describe('registerCronJob', () => {
		it('triggers immediately for past scheduledAt on once automation', () => {
			const pastDate = new Date(Date.now() - 60000).toISOString()
			const automation = storeFns.createAutomation({
				ownerUserId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'F1 Past Once',
				instruction: 'Past trigger',
				scheduleKind: 'once',
				intervalMinutes: 0,
				scheduledAt: pastDate,
				nextRunAt: pastDate
			})

			const countBefore = triggeredAutomations.length
			automationService.registerCronJob(automation)
			expect(triggeredAutomations.length).toBeGreaterThanOrEqual(countBefore + 1)
			expect(automationService.cronJobs.has(automation.id)).toBe(false)
		})

		it('creates CronJob for future scheduledAt on once automation', () => {
			const futureDate = new Date(Date.now() + 3600_000).toISOString()
			const automation = storeFns.createAutomation({
				ownerUserId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'F2 Future Once',
				instruction: 'Future trigger',
				scheduleKind: 'once',
				intervalMinutes: 0,
				scheduledAt: futureDate,
				nextRunAt: futureDate
			})

			automationService.registerCronJob(automation)
			expect(automationService.cronJobs.has(automation.id)).toBe(true)
			automationService.unregisterCronJob(automation.id)
		})
	})

	describe('CronJob management', () => {
		it('registers CronJob when creating cron automation', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'H1 Cron',
				instruction: 'CronJob test',
				scheduleKind: 'cron',
				cronExpression: '0 10 * * *'
			})
			expect(automationService.cronJobs.has(automation.id)).toBe(true)
			automationService.unregisterCronJob(automation.id)
		})

		it('unregisters CronJob when pausing cron automation', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'H2 Pause Cron',
				instruction: 'CronJob pause test',
				scheduleKind: 'cron',
				cronExpression: '0 11 * * *'
			})
			expect(automationService.cronJobs.has(automation.id)).toBe(true)

			automationService.pauseAutomation({
				automationId: automation.id,
				userId: rootUserId
			})
			expect(automationService.cronJobs.has(automation.id)).toBe(false)
		})

		it('unregisters CronJob when deleting cron automation', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'H3 Delete Cron',
				instruction: 'CronJob delete test',
				scheduleKind: 'cron',
				cronExpression: '0 14 * * *'
			})
			expect(automationService.cronJobs.has(automation.id)).toBe(true)

			automationService.deleteAutomation({
				automationId: automation.id,
				userId: rootUserId
			})
			expect(automationService.cronJobs.has(automation.id)).toBe(false)
		})
	})

	describe('resumeAutomation - cron/once', () => {
		it('resumes paused cron automation and registers CronJob', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'E1 Resume Cron',
				instruction: 'Resume cron test',
				scheduleKind: 'cron',
				cronExpression: '0 15 * * *'
			})
			automationService.pauseAutomation({
				automationId: automation.id,
				userId: rootUserId
			})
			expect(automationService.cronJobs.has(automation.id)).toBe(false)

			const result = automationService.resumeAutomation({
				automationId: automation.id,
				userId: rootUserId
			})
			expect(result.status).toBe('active')
			expect(result.nextRunAt).toBeTruthy()
			expect(automationService.cronJobs.has(automation.id)).toBe(true)
			automationService.unregisterCronJob(automation.id)
		})

		it('resumes paused once automation with nextRunAt=scheduledAt', () => {
			const futureDate = new Date(Date.now() + 7200_000).toISOString()
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'E2 Resume Once',
				instruction: 'Resume once test',
				scheduleKind: 'once',
				scheduledAt: futureDate
			})
			automationService.pauseAutomation({
				automationId: automation.id,
				userId: rootUserId
			})

			const result = automationService.resumeAutomation({
				automationId: automation.id,
				userId: rootUserId
			})
			expect(result.status).toBe('active')
			expect(result.nextRunAt).toBe(futureDate)
			automationService.unregisterCronJob(automation.id)
		})

		it('admin resumes cron automation and registers CronJob', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'E3 Admin Resume Cron',
				instruction: 'Admin resume cron test',
				scheduleKind: 'cron',
				cronExpression: '30 16 * * *'
			})
			automationService.adminPauseAutomation(automation.id)
			expect(automationService.cronJobs.has(automation.id)).toBe(false)

			const result = automationService.adminResumeAutomation(automation.id)
			expect(result.status).toBe('active')
			expect(result.nextRunAt).toBeTruthy()
			expect(automationService.cronJobs.has(automation.id)).toBe(true)
			automationService.unregisterCronJob(automation.id)
		})
	})

	describe('admin 404 paths', () => {
		it('adminPauseAutomation throws 404 for nonexistent id', () => {
			expect(() => {
				automationService.adminPauseAutomation('nonexistent-id')
			}).toThrow(/404|not found/i)
		})

		it('adminResumeAutomation throws 404 for nonexistent id', () => {
			expect(() => {
				automationService.adminResumeAutomation('nonexistent-id')
			}).toThrow(/404|not found/i)
		})

		it('adminDeleteAutomation throws 404 for nonexistent id', () => {
			expect(() => {
				automationService.adminDeleteAutomation('nonexistent-id')
			}).toThrow(/404|not found/i)
		})

		it('adminEditAutomation throws 404 for nonexistent id', () => {
			expect(() => {
				automationService.adminEditAutomation('nonexistent-id', { name: 'x' })
			}).toThrow(/404|not found/i)
		})
	})

	describe('scheduler lifecycle', () => {
		it('startScheduler and stopScheduler without errors', () => {
			automationService.startScheduler()
			automationService.stopScheduler()
			expect(automationService.cronJobs.size).toBe(0)
		})

		it('stopScheduler on unstarted scheduler does not error', () => {
			expect(() => {
				automationService.stopScheduler()
			}).not.toThrow()
		})

		it('startScheduler restores active cron automations from DB', () => {
			const automation = storeFns.createAutomation({
				ownerUserId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'G3 Restore Cron',
				instruction: 'Restore test',
				scheduleKind: 'cron',
				intervalMinutes: 0,
				cronExpression: '0 8 * * *',
				nextRunAt: new Date(Date.now() + 3600_000).toISOString()
			})

			automationService.startScheduler()
			expect(automationService.cronJobs.has(automation.id)).toBe(true)
			automationService.stopScheduler()
		})
	})

	describe('once schedule completion', () => {
		it('marks once automation as completed after trigger', () => {
			const futureDate = new Date(Date.now() + 1000).toISOString()
			const automation = storeFns.createAutomation({
				ownerUserId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Once Complete Test',
				instruction: 'Run once and complete',
				scheduleKind: 'once',
				intervalMinutes: 0,
				scheduledAt: futureDate,
				nextRunAt: futureDate
			})

			automationService.triggerAutomation(automation.id)

			const updated = storeFns.getAutomationById(automation.id)
			expect(updated.status).toBe('completed')
		})
	})

	describe('conversation cleanup', () => {
		it('archiveConversation marks conversation as archived', () => {
			const convo = storeFns.createConversation({
				userId: rootUserId,
				channelIdentityId,
				title: 'Archive Test',
				source: 'automation'
			})
			expect(convo.status).toBe('active')

			storeFns.archiveConversation(convo.id)
			const archived = storeFns.getConversationById(convo.id)
			expect(archived.status).toBe('archived')
		})
	})

	describe('store functions', () => {
		it('countActiveAutomationsByUser returns 0 for user with no automations', () => {
			const user = authService.createLocalUser({
				loginName: 'j1user',
				password: 'LongPassword12!',
				displayName: 'J1 User'
			})
			const count = storeFns.countActiveAutomationsByUser(user.id)
			expect(count).toBe(0)
		})

		it('hasActiveAutomationRun returns false when no active run exists', () => {
			const result = storeFns.hasActiveAutomationRun('nonexistent-automation-id')
			expect(result).toBe(false)
		})

		it('listAutomationConversations returns empty array when no conversations', () => {
			const result = storeFns.listAutomationConversations('nonexistent-automation-id')
			expect(result).toEqual([])
		})

		it('updateUserMaxAutomations updates maxAutomations correctly', () => {
			const user = authService.createLocalUser({
				loginName: 'j4user',
				password: 'LongPassword12!',
				displayName: 'J4 User'
			})
			const updated = storeFns.updateUserMaxAutomations(user.id, 50)
			expect(updated.maxAutomations).toBe(50)
		})

		it('getAutomationById returns null for nonexistent id', () => {
			const result = storeFns.getAutomationById('nonexistent-id-xyz')
			expect(result).toBeNull()
		})
	})

	describe('tool execute wrappers', () => {
		it('createAutomationTool.execute returns ok with automation', async () => {
			const context = {
				services: { automationService },
				userId: rootUserId,
				channelIdentityId,
				conversationId
			}
			const result = await createAutomationTool.execute({
				name: 'K1 Tool Create',
				instruction: 'Tool test',
				schedule_kind: 'cron',
				cron_expression: '*/10 * * * *'
			}, context)

			expect(result.ok).toBe(true)
			expect(result.automation).toBeTruthy()
			expect(result.automation.name).toBe('K1 Tool Create')
			expect(result.automation.scheduleKind).toBe('cron')
			automationService.unregisterCronJob(result.automation.id)
		})

		it('createAutomationTool.execute throws on empty name', async () => {
			const context = {
				services: { automationService },
				userId: rootUserId,
				channelIdentityId,
				conversationId
			}
			await expect(
				createAutomationTool.execute({
					name: '',
					instruction: 'Tool test',
					schedule_kind: 'cron',
					cron_expression: '0 9 * * *'
				}, context)
			).rejects.toThrow(/400|name/i)
		})

		it('editAutomationTool.execute returns ok with updated automation', async () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'K3 Editable',
				instruction: 'Edit me',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)
			const context = {
				services: { automationService },
				userId: rootUserId,
				channelIdentityId,
				conversationId
			}
			const result = await editAutomationTool.execute({
				automation_id: automation.id,
				name: 'K3 Updated'
			}, context)

			expect(result.ok).toBe(true)
			expect(result.automation.name).toBe('K3 Updated')
		})

		it('editAutomationTool.execute throws 403 for non-owner', async () => {
			const user = authService.createLocalUser({
				loginName: 'k4user',
				password: 'LongPassword12!',
				displayName: 'K4 User'
			})
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'K4 Not Editable',
				instruction: 'Check stuff',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)
			const context = {
				services: { automationService },
				userId: user.id,
				channelIdentityId,
				conversationId
			}
			await expect(
				editAutomationTool.execute({
					automation_id: automation.id,
					name: 'Hacked'
				}, context)
			).rejects.toThrow(/403|do not control/i)
		})
	})

	describe('pauseAutomation', () => {
		it('pauses automation owned by user', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Pausable',
				instruction: 'Check stuff',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)
			const result = automationService.pauseAutomation({
				automationId: automation.id,
				userId: rootUserId
			})
			expect(result.status).toBe('paused')
		})

		it('rejects pause from non-owner', () => {
			const user = authService.createLocalUser({
				loginName: 'autouser2',
				password: 'LongPassword12!',
				displayName: 'Auto User 2'
			})
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Not Yours Pause',
				instruction: 'Check stuff',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)
			expect(() => {
				automationService.pauseAutomation({
					automationId: automation.id,
					userId: user.id
				})
			}).toThrow(/403|do not control/i)
		})
	})

	describe('resumeAutomation', () => {
		it('resumes paused automation', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Resumable',
				instruction: 'Check stuff',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.pauseAutomation({
				automationId: automation.id,
				userId: rootUserId
			})
			const result = automationService.resumeAutomation({
				automationId: automation.id,
				userId: rootUserId
			})
			expect(result.status).toBe('active')
			expect(result.nextRunAt).toBeTruthy()
			automationService.unregisterCronJob(automation.id)
		})
	})

	describe('deleteAutomation', () => {
		it('deletes automation', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Deletable',
				instruction: 'Check stuff',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)
			automationService.deleteAutomation({
				automationId: automation.id,
				userId: rootUserId
			})
			const deleted = storeFns.getAutomationById(automation.id)
			expect(deleted.status).toBe('deleted')
		})
	})

	describe('runAutomationNow', () => {
		it('triggers onAutomationTriggered callback', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Run Now',
				instruction: 'Do it now',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)
			const countBefore = triggeredAutomations.length
			automationService.runAutomationNow({
				automationId: automation.id,
				userId: rootUserId
			})
			expect(triggeredAutomations.length).toBe(countBefore + 1)
			expect(triggeredAutomations[triggeredAutomations.length - 1].id).toBe(automation.id)
		})
	})

	describe('admin operations', () => {
		it('adminPauseAutomation bypasses ownership check', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Admin Pause',
				instruction: 'Check stuff',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)
			const result = automationService.adminPauseAutomation(automation.id)
			expect(result.status).toBe('paused')
		})

		it('adminResumeAutomation bypasses ownership check', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Admin Resume',
				instruction: 'Check stuff',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.adminPauseAutomation(automation.id)
			const result = automationService.adminResumeAutomation(automation.id)
			expect(result.status).toBe('active')
			automationService.unregisterCronJob(automation.id)
		})

		it('adminDeleteAutomation bypasses ownership check', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Admin Delete',
				instruction: 'Check stuff',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)
			automationService.adminDeleteAutomation(automation.id)
			const deleted = storeFns.getAutomationById(automation.id)
			expect(deleted.status).toBe('deleted')
		})

		it('adminEditAutomation changes fields', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Admin Edit',
				instruction: 'Check stuff',
				scheduleKind: 'cron',
				cronExpression: '0 9 * * *'
			})
			automationService.unregisterCronJob(automation.id)
			const updated = automationService.adminEditAutomation(automation.id, {
				name: 'Admin Edited',
				instruction: 'New instruction'
			})
			expect(updated.name).toBe('Admin Edited')
			expect(updated.instruction).toBe('New instruction')
		})
	})
})
