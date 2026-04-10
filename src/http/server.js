import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { URL, fileURLToPath, pathToFileURL } from 'node:url'
import { AuthService, requireActor, requireCsrf } from '../core/authService.js'
import { AdminAuthService, requireAdminActor, requireAdminCsrf } from '../core/adminAuthService.js'
import { registerDefaultChannelAdapters } from '../core/adapters/index.js'
import { appConfig } from '../core/config.js'
import { HttpError, applyCorsHeaders, applySecurityHeaders, mapErrorToResponse, readJsonBody, readRawBody, requireInteger, requireOptionalString, requireString, sendJson } from '../core/http.js'
import { MicroHarnessEngineApp } from '../core/app.js'
import { parseCookies, serializeCookie, verifyDiscordSignature, verifySlackSignature } from '../core/security.js'
import { browseFileSystem } from '../fsBrowserService.js'
import {
	createProtectionRuleApi,
	inspectProtectionPathApi,
	listProtectionRulesApi,
	removeProtectionRuleApi,
	setProtectionRuleEnabledApi
} from '../protection/api.js'

// --- Rate limiter (H-1) ---
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000
const LOGIN_RATE_MAX = 10
const loginAttempts = new Map()

function checkLoginRateLimit(ip) {
	const now = Date.now()
	let entry = loginAttempts.get(ip)
	if (!entry || now - entry.windowStart > LOGIN_RATE_WINDOW_MS) {
		entry = { windowStart: now, count: 0 }
		loginAttempts.set(ip, entry)
	}
	entry.count += 1
	if (entry.count > LOGIN_RATE_MAX) {
		throw new HttpError(429, 'Too many login attempts. Please try again later.')
	}
}

const rateLimitCleanupTimer = setInterval(() => {
	const now = Date.now()
	for (const [ip, entry] of loginAttempts) {
		if (now - entry.windowStart > LOGIN_RATE_WINDOW_MS) {
			loginAttempts.delete(ip)
		}
	}
}, 5 * 60 * 1000)
rateLimitCleanupTimer.unref()

const authService = new AuthService()
const adminAuthService = new AdminAuthService()
const app = new MicroHarnessEngineApp()
await app.init()
registerDefaultChannelAdapters(app)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'admin-web', 'dist')

function matchPath(pathname, pattern) {
	const pathParts = pathname.split('/').filter(Boolean)
	const patternParts = pattern.split('/').filter(Boolean)

	if (pathParts.length !== patternParts.length) {
		return null
	}

	const params = {}
	for (let index = 0; index < patternParts.length; index += 1) {
		const patternPart = patternParts[index]
		const pathPart = pathParts[index]
		if (patternPart.startsWith(':')) {
			params[patternPart.slice(1)] = decodeURIComponent(pathPart)
			continue
		}

		if (patternPart !== pathPart) {
			return null
		}
	}

	return params
}

function getMimeType(filePath) {
	const extension = path.extname(filePath).toLowerCase()
	switch (extension) {
		case '.html':
			return 'text/html; charset=utf-8'
		case '.js':
			return 'application/javascript; charset=utf-8'
		case '.css':
			return 'text/css; charset=utf-8'
		case '.json':
			return 'application/json; charset=utf-8'
		case '.svg':
			return 'image/svg+xml'
		default:
			return 'application/octet-stream'
	}
}

function parseAuthorizationHeader(req) {
	const value = req.headers.authorization
	if (!value || !value.startsWith('Bearer ')) {
		return null
	}
	return value.slice('Bearer '.length).trim()
}

function resolveActor(req) {
	const cookies = parseCookies(req.headers.cookie || '')
	const bearerToken = parseAuthorizationHeader(req)

	const tokenActor = authService.resolveActorFromBearerToken(bearerToken)
	if (tokenActor) {
		return tokenActor
	}

	return authService.resolveActorFromSession(cookies[appConfig.cookieName], {
		userAgent: req.headers['user-agent'] || null,
		ipAddress: req.socket.remoteAddress || null
	})
}

function resolveAdminActor(req) {
	const cookies = parseCookies(req.headers.cookie || '')
	return adminAuthService.resolveActor(cookies[appConfig.adminCookieName])
}

async function serveStatic(req, res) {
	if (!fs.existsSync(distDir)) {
		sendJson(res, 404, {
			ok: false,
			error: 'Web UI assets are not built yet.'
		})
		return
	}

	const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
	let targetPath = path.join(distDir, url.pathname === '/' ? 'index.html' : url.pathname.slice(1))
	if (!targetPath.startsWith(distDir)) {
		res.writeHead(403)
		res.end('Forbidden')
		return
	}

	if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
		targetPath = path.join(distDir, 'index.html')
	}

	applySecurityHeaders(res, { isSpa: true })
	res.writeHead(200, {
		'Content-Type': getMimeType(targetPath)
	})
	fs.createReadStream(targetPath).pipe(res)
}

async function handleApiRequest(req, res) {
	applySecurityHeaders(res)
	applyCorsHeaders(req, res)
	if (req.method === 'OPTIONS') {
		res.writeHead(204)
		res.end()
		return
	}

	const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
	const actor = resolveActor(req)

	try {
		if (req.method === 'GET' && url.pathname === '/api/health') {
			sendJson(res, 200, {
				ok: true,
				data: {
					status: 'ok',
					provider: appConfig.llmProvider,
					projectRoot: appConfig.projectRoot
				}
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/auth/login') {
			checkLoginRateLimit(req.socket.remoteAddress || 'unknown')
			const body = await readJsonBody(req)
			const result = authService.loginLocalUser({
				loginName: requireString(body.loginName, 'loginName', { maxLength: 32 }),
				password: requireString(body.password, 'password', { maxLength: 200 }),
				userAgent: req.headers['user-agent'] || null,
				ipAddress: req.socket.remoteAddress || null
			})
			sendJson(res, 200, {
				ok: true,
				data: {
					user: result.user,
					csrfToken: result.csrfToken,
					expiresAt: result.expiresAt
				}
			}, {
				'Set-Cookie': serializeCookie(appConfig.cookieName, result.sessionToken, {
					httpOnly: true,
					sameSite: 'Lax',
					path: '/',
					maxAge: 60 * 60 * appConfig.authSessionTtlHours
				})
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
			const cookies = parseCookies(req.headers.cookie || '')
			authService.logoutSession(cookies[appConfig.cookieName])
			sendJson(res, 200, {
				ok: true,
				data: {
					loggedOut: true
				}
			}, {
				'Set-Cookie': serializeCookie(appConfig.cookieName, '', {
					httpOnly: true,
					sameSite: 'Lax',
					path: '/',
					maxAge: 0
				})
			})
			return
		}

		if (req.method === 'GET' && url.pathname === '/api/auth/me') {
			sendJson(res, 200, {
				ok: true,
				data: {
					user: actor?.user || null,
					csrfToken: actor?.csrfToken || null,
					bootstrapRequired: false,
					webBootstrapEnabled: false
				}
			})
			return
		}

		const adminActor = resolveAdminActor(req)

		if (req.method === 'GET' && url.pathname === '/api/admin/auth/me') {
			sendJson(res, 200, {
				ok: true,
				data: {
					adminAuthenticated: Boolean(adminActor?.admin),
					csrfToken: adminActor?.csrfToken || null,
					adminEnabled: adminAuthService.isEnabled(),
					user: adminActor?.user || null
				}
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/admin/auth/login') {
			checkLoginRateLimit(req.socket.remoteAddress || 'unknown')
			const body = await readJsonBody(req)
			const result = adminAuthService.login({
				loginName: requireString(body.loginName, 'loginName', { maxLength: 32 }),
				password: requireString(body.password, 'password', { maxLength: 200 }),
				userAgent: req.headers['user-agent'] || null,
				ipAddress: req.socket.remoteAddress || null
			})
			sendJson(res, 200, {
				ok: true,
				data: {
					adminAuthenticated: true,
					csrfToken: result.csrfToken,
					expiresAt: result.expiresAt,
					user: result.user
				}
			}, {
				'Set-Cookie': serializeCookie(appConfig.adminCookieName, result.sessionToken, {
					httpOnly: true,
					sameSite: 'Strict',
					path: '/',
					maxAge: 60 * 60 * appConfig.adminSessionTtlHours
				})
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/admin/auth/logout') {
			const cookies = parseCookies(req.headers.cookie || '')
			adminAuthService.logout(cookies[appConfig.adminCookieName])
			sendJson(res, 200, {
				ok: true,
				data: {
					loggedOut: true
				}
			}, {
				'Set-Cookie': serializeCookie(appConfig.adminCookieName, '', {
					httpOnly: true,
					sameSite: 'Strict',
					path: '/',
					maxAge: 0
				})
			})
			return
		}

		if (req.method === 'GET' && url.pathname === '/api/admin/bootstrap') {
			requireAdminActor(adminActor)
			sendJson(res, 200, {
				ok: true,
				data: {
					overview: app.listAdminOverview(),
					users: app.listAdminUsers(),
					toolPolicies: app.listAdminToolPolicies(),
					filePolicies: app.listAdminFilePolicies(),
					protectionRules: app.listAdminProtectionRules(),
					approvals: app.listAdminApprovals(),
					automations: app.listAdminAutomations(),
					tools: [...app.toolRegistry.listTools(), ...app.mcpManager.listTools()],
					mcpServers: app.mcpManager.getServerStatuses(),
					skills: app.listAdminSkills(),
					mcpServerConfigs: app.listAdminMcpServers(),
					csrfToken: adminActor.csrfToken
				}
			})
			return
		}

		if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
			const authenticated = requireActor(actor)
			sendJson(res, 200, {
				ok: true,
				data: {
					user: authenticated.user,
					csrfToken: authenticated.csrfToken || null,
					conversations: app.listConversationSummaries(authenticated.user.id),
					apiTokens: authService.listPersonalAccessTokens(authenticated.user.id)
				}
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/me/tokens') {
			const authenticated = requireActor(actor)
			requireCsrf(authenticated, req)
			const body = await readJsonBody(req)
			sendJson(res, 201, {
				ok: true,
				data: authService.createPersonalAccessToken(authenticated.user.id, requireString(body.name, 'name', { maxLength: 100 }))
			})
			return
		}

		const deleteTokenParams = matchPath(url.pathname, '/api/me/tokens/:tokenId')
		if (req.method === 'DELETE' && deleteTokenParams) {
			const authenticated = requireActor(actor)
			requireCsrf(authenticated, req)
			authService.revokePersonalAccessToken(authenticated.user.id, deleteTokenParams.tokenId)
			sendJson(res, 200, {
				ok: true,
				data: {
					revoked: true
				}
			})
			return
		}

		if (req.method === 'GET' && url.pathname === '/api/conversations') {
			const authenticated = requireActor(actor)
			sendJson(res, 200, {
				ok: true,
				data: {
					conversations: app.listConversationSummaries(authenticated.user.id)
				}
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/conversations') {
			const authenticated = requireActor(actor)
			requireCsrf(authenticated, req)
			const body = await readJsonBody(req)
			sendJson(res, 201, {
				ok: true,
				data: app.createWebConversation(authenticated.user.id, body.title || 'New Conversation')
			})
			return
		}

		const conversationParams = matchPath(url.pathname, '/api/conversations/:conversationId')
		if (req.method === 'GET' && conversationParams) {
			const authenticated = requireActor(actor)
			sendJson(res, 200, {
				ok: true,
				data: app.getConversationView({
					conversationId: conversationParams.conversationId,
					actor: authenticated
				})
			})
			return
		}

		const conversationMessageParams = matchPath(url.pathname, '/api/conversations/:conversationId/messages')
		if (req.method === 'POST' && conversationMessageParams) {
			const authenticated = requireActor(actor)
			requireCsrf(authenticated, req)
			const body = await readJsonBody(req)
			sendJson(res, 202, {
				ok: true,
				data: app.postUserMessage({
					conversationId: conversationMessageParams.conversationId,
					actor: authenticated,
					text: requireString(body.text, 'text', { maxLength: 50_000 })
				})
			})
			return
		}

		const conversationAutomationParams = matchPath(url.pathname, '/api/conversations/:conversationId/automations')
		if (req.method === 'POST' && conversationAutomationParams) {
			const authenticated = requireActor(actor)
			requireCsrf(authenticated, req)
			const body = await readJsonBody(req)
			sendJson(res, 201, {
				ok: true,
				data: app.createAutomation({
					conversationId: conversationAutomationParams.conversationId,
					actor: authenticated,
					name: requireString(body.name, 'name', { maxLength: 200 }),
					instruction: requireString(body.instruction, 'instruction'),
					intervalMinutes: requireInteger(body.intervalMinutes, 'intervalMinutes')
				})
			})
			return
		}

		const automationParams = matchPath(url.pathname, '/api/automations/:automationId')
		if (req.method === 'PATCH' && automationParams) {
			const authenticated = requireActor(actor)
			requireCsrf(authenticated, req)
			const body = await readJsonBody(req)
			const nextStatus = String(body.status || '').trim().toLowerCase()
			let data
			if (nextStatus === 'paused') {
				data = app.pauseAutomation({
					automationId: automationParams.automationId,
					actor: authenticated
				})
			} else if (nextStatus === 'active') {
				data = app.resumeAutomation({
					automationId: automationParams.automationId,
					actor: authenticated
				})
			} else {
				throw new HttpError(400, 'status must be paused or active.')
			}

			sendJson(res, 200, {
				ok: true,
				data
			})
			return
		}

		if (req.method === 'DELETE' && automationParams) {
			const authenticated = requireActor(actor)
			requireCsrf(authenticated, req)
			app.deleteAutomation({
				automationId: automationParams.automationId,
				actor: authenticated
			})
			sendJson(res, 200, {
				ok: true,
				data: {
					deleted: true
				}
			})
			return
		}

		const automationRunNowParams = matchPath(url.pathname, '/api/automations/:automationId/run-now')
		if (req.method === 'POST' && automationRunNowParams) {
			const authenticated = requireActor(actor)
			requireCsrf(authenticated, req)
			sendJson(res, 202, {
				ok: true,
				data: app.runAutomationNow({
					automationId: automationRunNowParams.automationId,
					actor: authenticated
				})
			})
			return
		}

		const cancelRunParams = matchPath(url.pathname, '/api/runs/:runId/cancel')
		if (req.method === 'POST' && cancelRunParams) {
			const authenticated = requireActor(actor)
			requireCsrf(authenticated, req)
			sendJson(res, 200, {
				ok: true,
				data: app.cancelRun({
					runId: cancelRunParams.runId,
					actor: authenticated
				})
			})
			return
		}

		const streamParams = matchPath(url.pathname, '/api/conversations/:conversationId/stream')
		if (req.method === 'GET' && streamParams) {
			const authenticated = requireActor(actor)
			const conversation = app.getConversationView({
				conversationId: streamParams.conversationId,
				actor: authenticated
			})
			if (!conversation) {
				sendJson(res, 404, { ok: false, error: 'Conversation not found.' })
				return
			}

			res.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no'
			})
			res.write(': connected\n\n')

			const heartbeat = setInterval(() => {
				res.write(': heartbeat\n\n')
			}, 30000)

			const listener = (event) => {
				try {
					res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
				} catch {}
			}
			app.addRunEventListener(streamParams.conversationId, listener)

			const cleanup = () => {
				clearInterval(heartbeat)
				app.removeRunEventListener(streamParams.conversationId, listener)
			}
			req.on('close', cleanup)
			req.on('error', cleanup)
			return
		}

		const approvalDecisionParams = matchPath(url.pathname, '/api/approvals/:approvalId/decision')
		if (req.method === 'POST' && approvalDecisionParams) {
			const authenticated = requireActor(actor)
			requireCsrf(authenticated, req)
			const body = await readJsonBody(req)
			sendJson(res, 200, {
				ok: true,
				data: app.decideApproval({
					approvalId: approvalDecisionParams.approvalId,
					actor: authenticated,
					decision: requireString(body.decision, 'decision')
				})
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/admin/users') {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 201, {
				ok: true,
				data: authService.createLocalUser({
					loginName: requireString(body.loginName, 'loginName', { maxLength: 32 }),
					displayName: requireString(body.displayName, 'displayName', { maxLength: 100 }),
					password: requireString(body.password, 'password', { maxLength: 200 }),
					role: body.role === 'admin' ? 'admin' : 'user'
				})
			})
			return
		}

		const adminUserParams = matchPath(url.pathname, '/api/admin/users/:userId')
		if (req.method === 'PATCH' && adminUserParams) {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 200, {
				ok: true,
				data: authService.updateLocalUser(adminUserParams.userId, {
					loginName: body.loginName,
					displayName: body.displayName,
					role: body.role,
					status: body.status
				})
			})
			return
		}

		if (req.method === 'DELETE' && adminUserParams) {
			requireAdminCsrf(adminActor, req)
			sendJson(res, 200, {
				ok: true,
				data: authService.deleteLocalUser(adminUserParams.userId)
			})
			return
		}

		const adminUserPasswordParams = matchPath(url.pathname, '/api/admin/users/:userId/password')
		if (req.method === 'POST' && adminUserPasswordParams) {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 200, {
				ok: true,
				data: authService.setLocalUserPassword(
					adminUserPasswordParams.userId,
					requireString(body.password, 'password', { maxLength: 200 })
				)
			})
			return
		}

		const adminUserPolicyParams = matchPath(url.pathname, '/api/admin/users/:userId/policies')
		if (req.method === 'PATCH' && adminUserPolicyParams) {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 200, {
				ok: true,
				data: app.policyService.assignPoliciesToUser(adminUserPolicyParams.userId, {
					toolPolicyId: requireString(body.toolPolicyId, 'toolPolicyId'),
					filePolicyId: requireString(body.filePolicyId, 'filePolicyId')
				})
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/admin/tool-policies') {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 201, {
				ok: true,
				data: app.policyService.createToolPolicy(body)
			})
			return
		}

		const adminToolPolicyParams = matchPath(url.pathname, '/api/admin/tool-policies/:policyId')
		if (req.method === 'PATCH' && adminToolPolicyParams) {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 200, {
				ok: true,
				data: app.policyService.updateToolPolicyRecord(adminToolPolicyParams.policyId, body)
			})
			return
		}

		if (req.method === 'DELETE' && adminToolPolicyParams) {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 200, {
				ok: true,
				data: app.policyService.deleteToolPolicy(
					adminToolPolicyParams.policyId,
					requireOptionalString(body.replacementPolicyId)
				)
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/admin/file-policies') {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 201, {
				ok: true,
				data: app.policyService.createFilePolicy(body)
			})
			return
		}

		const adminFilePolicyParams = matchPath(url.pathname, '/api/admin/file-policies/:policyId')
		if (req.method === 'PATCH' && adminFilePolicyParams) {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 200, {
				ok: true,
				data: app.policyService.updateFilePolicyRecord(adminFilePolicyParams.policyId, body)
			})
			return
		}

		if (req.method === 'DELETE' && adminFilePolicyParams) {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 200, {
				ok: true,
				data: app.policyService.deleteFilePolicy(
					adminFilePolicyParams.policyId,
					requireOptionalString(body.replacementPolicyId)
				)
			})
			return
		}

		const adminFilePolicyRootParams = matchPath(url.pathname, '/api/admin/file-policies/:policyId/roots')
		if (req.method === 'POST' && adminFilePolicyRootParams) {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 201, {
				ok: true,
				data: app.policyService.addRootToFilePolicy(adminFilePolicyRootParams.policyId, {
					scope: requireString(body.scope, 'scope'),
					rootPath: requireString(body.rootPath, 'rootPath'),
					pathType: requireString(body.pathType, 'pathType')
				})
			})
			return
		}

		const adminFilePolicyRootDeleteParams = matchPath(url.pathname, '/api/admin/file-policies/:policyId/roots/:rootId')
		if (req.method === 'DELETE' && adminFilePolicyRootDeleteParams) {
			requireAdminCsrf(adminActor, req)
			app.policyService.deleteRoot(adminFilePolicyRootDeleteParams.rootId)
			sendJson(res, 200, {
				ok: true,
				data: {
					deleted: true
				}
			})
			return
		}

		if (req.method === 'GET' && url.pathname === '/api/admin/fs/probe') {
			requireAdminActor(adminActor)
			sendJson(res, 200, {
				ok: true,
				data: app.policyService.probePath(url.searchParams.get('path'))
			})
			return
		}

		if (req.method === 'GET' && url.pathname === '/api/admin/fs/browse') {
			requireAdminActor(adminActor)
			sendJson(res, 200, {
				ok: true,
				data: browseFileSystem(url.searchParams.get('path'))
			})
			return
		}

		const adminApprovalDecisionParams = matchPath(url.pathname, '/api/admin/approvals/:approvalId/decision')
		if (req.method === 'POST' && adminApprovalDecisionParams) {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 200, {
				ok: true,
				data: app.adminDecideApproval({
					approvalId: adminApprovalDecisionParams.approvalId,
					decision: requireString(body.decision, 'decision')
				})
			})
			return
		}

		const adminAutomationParams = matchPath(url.pathname, '/api/admin/automations/:automationId')
		if (req.method === 'PATCH' && adminAutomationParams) {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			const nextStatus = String(body.status || '').trim().toLowerCase()
			if (nextStatus !== 'paused') {
				throw new HttpError(400, 'status must be paused.')
			}

			sendJson(res, 200, {
				ok: true,
				data: app.adminPauseAutomation(adminAutomationParams.automationId)
			})
			return
		}

		if (req.method === 'DELETE' && adminAutomationParams) {
			requireAdminCsrf(adminActor, req)
			app.adminDeleteAutomation(adminAutomationParams.automationId)
			sendJson(res, 200, {
				ok: true,
				data: {
					deleted: true
				}
			})
			return
		}

		// --- Admin Skills CRUD ---

		if (req.method === 'GET' && url.pathname === '/api/admin/skills') {
			requireAdminActor(adminActor)
			sendJson(res, 200, {
				ok: true,
				data: app.listAdminSkills()
			})
			return
		}

		const adminSkillParams = matchPath(url.pathname, '/api/admin/skills/:skillName')
		if (req.method === 'GET' && adminSkillParams) {
			requireAdminActor(adminActor)
			sendJson(res, 200, {
				ok: true,
				data: app.getAdminSkill(adminSkillParams.skillName)
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/admin/skills') {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 201, {
				ok: true,
				data: app.createAdminSkill({
					name: requireString(body.name, 'name', { maxLength: 100 }),
					description: requireString(body.description, 'description', { maxLength: 500 }),
					prompt: requireString(body.prompt, 'prompt')
				})
			})
			return
		}

		if (req.method === 'PATCH' && adminSkillParams) {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 200, {
				ok: true,
				data: app.updateAdminSkill(adminSkillParams.skillName, {
					description: body.description,
					prompt: body.prompt
				})
			})
			return
		}

		if (req.method === 'DELETE' && adminSkillParams) {
			requireAdminCsrf(adminActor, req)
			app.deleteAdminSkill(adminSkillParams.skillName)
			sendJson(res, 200, {
				ok: true,
				data: { deleted: true }
			})
			return
		}

		// --- Admin MCP Servers CRUD ---

		if (req.method === 'GET' && url.pathname === '/api/admin/mcp-servers') {
			requireAdminActor(adminActor)
			sendJson(res, 200, {
				ok: true,
				data: app.listAdminMcpServers()
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/admin/mcp-servers') {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 201, {
				ok: true,
				data: app.createAdminMcpServer({
					name: requireString(body.name, 'name'),
					config: body.config || {}
				})
			})
			return
		}

		const adminMcpServerParams = matchPath(url.pathname, '/api/admin/mcp-servers/:serverName')
		if (req.method === 'PATCH' && adminMcpServerParams) {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 200, {
				ok: true,
				data: await app.updateAdminMcpServer(adminMcpServerParams.serverName, {
					config: body.config || {}
				})
			})
			return
		}

		if (req.method === 'DELETE' && adminMcpServerParams) {
			requireAdminCsrf(adminActor, req)
			await app.deleteAdminMcpServer(adminMcpServerParams.serverName)
			sendJson(res, 200, {
				ok: true,
				data: { deleted: true }
			})
			return
		}

		const adminMcpReconnectParams = matchPath(url.pathname, '/api/admin/mcp-servers/:serverName/reconnect')
		if (req.method === 'POST' && adminMcpReconnectParams) {
			requireAdminCsrf(adminActor, req)
			sendJson(res, 200, {
				ok: true,
				data: await app.reconnectAdminMcpServer(adminMcpReconnectParams.serverName)
			})
			return
		}

		if (req.method === 'GET' && url.pathname === '/api/admin/protection-rules') {
			requireAdminActor(adminActor)
			sendJson(res, 200, {
				ok: true,
				data: listProtectionRulesApi()
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/admin/protection-rules') {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 201, {
				ok: true,
				data: createProtectionRuleApi(body)
			})
			return
		}

		const adminProtectionRuleParams = matchPath(url.pathname, '/api/admin/protection-rules/:ruleId')
		if (req.method === 'PATCH' && adminProtectionRuleParams) {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 200, {
				ok: true,
				data: setProtectionRuleEnabledApi(
					adminProtectionRuleParams.ruleId,
					Boolean(body.enabled)
				)
			})
			return
		}

		if (req.method === 'DELETE' && adminProtectionRuleParams) {
			requireAdminCsrf(adminActor, req)
			sendJson(res, 200, {
				ok: true,
				data: removeProtectionRuleApi(adminProtectionRuleParams.ruleId)
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/admin/protection-rules/inspect') {
			requireAdminCsrf(adminActor, req)
			const body = await readJsonBody(req)
			sendJson(res, 200, {
				ok: true,
				data: inspectProtectionPathApi(requireString(body.path, 'path', { maxLength: 4096 }))
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/integrations/slack/events') {
			const rawBody = await readRawBody(req)
			const signature = req.headers['x-slack-signature']
			const timestamp = req.headers['x-slack-request-timestamp']
			if (!verifySlackSignature({
				signingSecret: appConfig.slackSigningSecret,
				timestamp,
				rawBody,
				signature
			})) {
				throw new HttpError(401, 'Invalid Slack signature.')
			}

			const payload = rawBody ? JSON.parse(rawBody) : {}
			const result = await app.channelAdapters.get('slack').handleEvent(payload)
			if (result?.type === 'url_verification') {
				sendJson(res, 200, {
					challenge: result.challenge
				})
				return
			}

			sendJson(res, 200, {
				ok: true
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/integrations/slack/actions') {
			const rawBody = await readRawBody(req)
			const signature = req.headers['x-slack-signature']
			const timestamp = req.headers['x-slack-request-timestamp']
			if (!verifySlackSignature({
				signingSecret: appConfig.slackSigningSecret,
				timestamp,
				rawBody,
				signature
			})) {
				throw new HttpError(401, 'Invalid Slack signature.')
			}

			const params = new URLSearchParams(rawBody)
			const payload = JSON.parse(params.get('payload') || '{}')
			await app.channelAdapters.get('slack').handleInteraction(payload)
			sendJson(res, 200, {
				ok: true
			})
			return
		}

		if (req.method === 'POST' && url.pathname === '/api/integrations/discord/interactions') {
			const rawBody = await readRawBody(req)
			const signature = req.headers['x-signature-ed25519']
			const timestamp = req.headers['x-signature-timestamp']
			if (!verifyDiscordSignature({
				publicKey: appConfig.discordPublicKey,
				timestamp,
				rawBody,
				signature
			})) {
				throw new HttpError(401, 'Invalid Discord signature.')
			}

			const payload = rawBody ? JSON.parse(rawBody) : {}
			const response = await app.channelAdapters.get('discord').handleInteraction(payload)
			sendJson(res, 200, response)
			return
		}

		throw new HttpError(404, 'Route not found.')
	} catch (error) {
		const mapped = mapErrorToResponse(error)
		sendJson(res, mapped.statusCode, mapped.body)
	}
}

export function createApiServer() {
	return http.createServer((req, res) => {
		if ((req.url || '/').startsWith('/api/')) {
			handleApiRequest(req, res)
			return
		}

		serveStatic(req, res)
	})
}

export async function startApiServer({
	port = appConfig.apiPort
} = {}) {
	app.startMcp()
	app.startAutomationScheduler()
	const server = createApiServer()

	const gracefulShutdown = async () => {
		console.log('\nShutting down...')
		app.stopAutomationScheduler()
		await app.stopMcp()
		server.close(() => {
			process.exit(0)
		})
		setTimeout(() => process.exit(1), 10_000)
	}

	process.on('SIGTERM', gracefulShutdown)
	process.on('SIGINT', gracefulShutdown)

	server.listen(port, () => {
		const address = server.address()
		const actualPort = typeof address === 'object' && address ? address.port : port
		console.log(`microHarnessEngine API listening on http://localhost:${actualPort}`)
		if (process.env.MHE_DEV) {
			console.log(`  Web UI (dev): http://localhost:4173`)
		} else {
			console.log(`  Web UI: http://localhost:${actualPort}`)
		}
		app.recoverInterruptedRuns().catch(error => {
			console.error('Startup recovery failed:', error?.message || error)
		})
	})
	return server
}

const entryUrl = process.argv[1]
	? pathToFileURL(path.resolve(process.argv[1])).href
	: null

if (entryUrl && import.meta.url === entryUrl) {
	startApiServer()
}
