import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createTempDir, removeTempDir, setupTestEnv } from '../helpers/setup.js'

let tempDir
let AutomationService
let AuthService
let storeFns

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
		it('creates automation with correct fields', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Daily Check',
				instruction: 'Check for updates',
				intervalMinutes: 10
			})
			expect(automation.id).toBeTruthy()
			expect(automation.name).toBe('Daily Check')
			expect(automation.intervalMinutes).toBe(10)
			expect(automation.status).toBe('active')
			expect(automation.nextRunAt).toBeTruthy()
		})

		it('rejects interval less than 5 minutes', () => {
			expect(() => {
				automationService.createAutomationFromTool({
					userId: rootUserId,
					channelIdentityId,
					conversationId,
					name: 'Too Fast',
					instruction: 'Do something',
					intervalMinutes: 3
				})
			}).toThrow(/400|at least 5/i)
		})

		it('rejects empty name', () => {
			expect(() => {
				automationService.createAutomationFromTool({
					userId: rootUserId,
					channelIdentityId,
					conversationId,
					name: '',
					instruction: 'Do something',
					intervalMinutes: 10
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
					intervalMinutes: 10
				})
			}).toThrow(/400|instruction/i)
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
				intervalMinutes: 10
			})
			const result = automationService.pauseAutomation({
				automationId: automation.id,
				userId: rootUserId
			})
			expect(result.status).toBe('paused')
		})

		it('rejects pause from non-owner', () => {
			const user = authService.createLocalUser({
				loginName: 'autouser1',
				password: 'LongPassword12!',
				displayName: 'Auto User'
			})
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Not Yours',
				instruction: 'Check stuff',
				intervalMinutes: 10
			})
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
				intervalMinutes: 15
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
				intervalMinutes: 10
			})
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
				intervalMinutes: 10
			})
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
				intervalMinutes: 10
			})
			const result = automationService.adminPauseAutomation(automation.id)
			expect(result.status).toBe('paused')
		})

		it('adminDeleteAutomation bypasses ownership check', () => {
			const automation = automationService.createAutomationFromTool({
				userId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Admin Delete',
				instruction: 'Check stuff',
				intervalMinutes: 10
			})
			automationService.adminDeleteAutomation(automation.id)
			const deleted = storeFns.getAutomationById(automation.id)
			expect(deleted.status).toBe('deleted')
		})
	})

	describe('pollDueAutomations', () => {
		it('triggers only due active automations', () => {
			// Create automation with short interval and past nextRunAt
			const automation = storeFns.createAutomation({
				ownerUserId: rootUserId,
				channelIdentityId,
				conversationId,
				name: 'Due Poll',
				instruction: 'Poll me',
				intervalMinutes: 5,
				nextRunAt: new Date(Date.now() - 60000).toISOString()
			})

			const countBefore = triggeredAutomations.length
			automationService.pollDueAutomations()
			expect(triggeredAutomations.length).toBeGreaterThan(countBefore)
		})
	})
})
