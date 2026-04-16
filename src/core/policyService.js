import fs from 'node:fs'
import path from 'node:path'
import { appConfig } from './config.js'
import { HttpError } from './http.js'
import { listProtectionRules } from '../protection/service.js'
import {
	createFilePolicy,
	createFilePolicyRoot,
	createToolPolicy,
	deleteFilePolicyRecord,
	deleteFilePolicyRootRecord,
	deleteToolPolicyRecord,
	getDefaultFilePolicy,
	getDefaultToolPolicy,
	getFilePolicyById,
	getFilePolicyRootById,
	getSystemAllToolsPolicy,
	getToolPolicyById,
	getUserById,
	getUserPolicyBinding,
	listFilePolicies,
	listFilePolicyRoots,
	listPendingApprovals,
	listToolPolicies,
	listToolPolicyTools,
	listUsers,
	replaceToolPolicyTools,
	setUserPolicyBinding,
	updateFilePolicy,
	updateToolPolicy,
	listAutomations
} from './store.js'

function normalizeLoginName(value) {
	return String(value || '').trim().toLowerCase()
}

function normalizeComparablePath(targetPath) {
	const resolved = path.resolve(targetPath)
	return process.platform === 'win32'
		? resolved.toLowerCase()
		: resolved
}

function resolveThroughExistingAncestor(targetPath) {
	const resolved = path.resolve(targetPath)
	let cursor = resolved
	const pendingSegments = []

	while (!fs.existsSync(cursor)) {
		const parent = path.dirname(cursor)
		if (parent === cursor) {
			break
		}

		pendingSegments.unshift(path.basename(cursor))
		cursor = parent
	}

	const basePath = fs.existsSync(cursor)
		? fs.realpathSync.native(cursor)
		: cursor

	return pendingSegments.length > 0
		? path.resolve(basePath, ...pendingSegments)
		: basePath
}

function canonicalizeComparablePath(targetPath) {
	return normalizeComparablePath(resolveThroughExistingAncestor(targetPath))
}

function isWithinDirectory(directoryPath, targetPath) {
	const normalizedDirectory = canonicalizeComparablePath(directoryPath)
	const normalizedTarget = canonicalizeComparablePath(targetPath)
	const relativePath = path.relative(normalizedDirectory, normalizedTarget)
	return (
		relativePath === '' ||
		(
			relativePath !== '..' &&
			!relativePath.startsWith(`..${path.sep}`) &&
			!path.isAbsolute(relativePath)
		)
	)
}

function validateToolNames(toolNames, catalog) {
	const knownTools = new Set(catalog.map(tool => tool.name))
	for (const toolName of toolNames) {
		if (!knownTools.has(toolName)) {
			throw new HttpError(400, `Unknown tool: ${toolName}`)
		}
	}
}

function filterToKnownToolNames(toolNames, catalog) {
	const knownTools = new Set(catalog.map(tool => tool.name))
	return toolNames.filter(name => knownTools.has(name))
}

/**
 * MCPツール名のサニタイズ: Claude APIの名前規則 ^[a-zA-Z0-9_-]{1,128}$ に合わせる。
 * "serverName__toolName" 形式の場合、サーバー名プレフィックスを保持したままツール名部分をサニタイズする。
 */
function sanitizeMcpToolName(name) {
	const sep = name.indexOf('__')
	if (sep === -1) return name
	const prefix = name.slice(0, sep + 2)
	const toolPart = name.slice(sep + 2)
	return prefix + toolPart.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)
}

function normalizeToolNames(toolNames = []) {
	if (!Array.isArray(toolNames)) {
		throw new HttpError(400, 'tools must be an array.')
	}

	return Array.from(new Set(
		toolNames
			.map(toolName => sanitizeMcpToolName(String(toolName || '').trim()))
			.filter(Boolean)
	))
}

function normalizeRootPath(rootPath, scope) {
	const normalized = String(rootPath || '').trim()
	if (!normalized) {
		throw new HttpError(400, 'rootPath is required.')
	}

	if (scope === 'workspace') {
		return path.relative(appConfig.projectRoot, path.resolve(appConfig.projectRoot, normalized)) || '.'
	}

	return path.resolve(normalized)
}

function mapToolPolicyDetailed(policy, catalog = []) {
	const detailByName = new Map(catalog.map(tool => [tool.name, tool]))
	const tools = listToolPolicyTools(policy.id)
	return {
		...policy,
		tools,
		toolDetails: tools.map(toolName => ({
			name: toolName,
			description: detailByName.get(toolName)?.description || '',
			riskLevel: detailByName.get(toolName)?.riskLevel || 'safe',
			source: detailByName.get(toolName)?.source || 'plugin'
		}))
	}
}

function mapFilePolicyDetailed(policy) {
	return {
		...policy,
		roots: listFilePolicyRoots(policy.id)
	}
}

export class PolicyService {
	constructor({ getToolCatalog }) {
		this.getToolCatalog = getToolCatalog
		this.syncSystemPolicies()
	}

	syncSystemPolicies() {
		const allToolsPolicy = getSystemAllToolsPolicy()
		if (!allToolsPolicy) {
			return
		}

		const toolNames = this.getToolCatalog().map(tool => tool.name)
		replaceToolPolicyTools(allToolsPolicy.id, toolNames)
	}

	listToolPoliciesDetailed() {
		const catalog = this.getToolCatalog()
		return listToolPolicies().map(policy => mapToolPolicyDetailed(policy, catalog))
	}

	listFilePoliciesDetailed() {
		return listFilePolicies().map(mapFilePolicyDetailed)
	}

	listUsersWithPolicies() {
		return listUsers().map(user => {
			const binding = getUserPolicyBinding(user.id)
			return {
				...user,
				loginName: normalizeLoginName(user.loginName),
				toolPolicy: binding ? getToolPolicyById(binding.toolPolicyId) : getDefaultToolPolicy(),
				filePolicy: binding ? getFilePolicyById(binding.filePolicyId) : getDefaultFilePolicy()
			}
		})
	}

	assignPoliciesToUser(userId, {
		toolPolicyId,
		filePolicyId
	}) {
		if (!getUserById(userId)) {
			throw new HttpError(404, 'User not found.')
		}

		const toolPolicy = getToolPolicyById(toolPolicyId)
		if (!toolPolicy) {
			throw new HttpError(404, 'Tool policy not found.')
		}

		const filePolicy = getFilePolicyById(filePolicyId)
		if (!filePolicy) {
			throw new HttpError(404, 'File policy not found.')
		}

		return setUserPolicyBinding({
			userId,
			toolPolicyId: toolPolicy.id,
			filePolicyId: filePolicy.id
		})
	}

	createToolPolicy(payload) {
		const toolNames = normalizeToolNames(payload.tools)
		validateToolNames(toolNames, this.getToolCatalog())
		const policy = createToolPolicy({
			name: String(payload.name || '').trim(),
			description: payload.description ? String(payload.description).trim() : null
		})
		replaceToolPolicyTools(policy.id, toolNames)
		return mapToolPolicyDetailed(getToolPolicyById(policy.id))
	}

	updateToolPolicyRecord(policyId, payload) {
		const current = getToolPolicyById(policyId)
		if (!current) {
			throw new HttpError(404, 'Tool policy not found.')
		}
		if (current.isSystem) {
			throw new HttpError(400, 'System tool policies cannot be edited.')
		}

		const toolNames = normalizeToolNames(payload.tools)
		updateToolPolicy({
			id: current.id,
			name: String(payload.name || current.name).trim(),
			description: payload.description != null ? String(payload.description).trim() : current.description
		})
		replaceToolPolicyTools(current.id, toolNames)
		return mapToolPolicyDetailed(getToolPolicyById(current.id))
	}

	deleteToolPolicy(policyId, replacementPolicyId) {
		const current = getToolPolicyById(policyId)
		if (!current) {
			throw new HttpError(404, 'Tool policy not found.')
		}
		if (current.isSystem) {
			throw new HttpError(400, 'System tool policies cannot be deleted.')
		}

		const assignedUsers = listUsers().filter(user => {
			const binding = getUserPolicyBinding(user.id)
			return binding?.toolPolicyId === current.id
		})
		const replacement = replacementPolicyId ? getToolPolicyById(replacementPolicyId) : null
		if (assignedUsers.length > 0 && (!replacement || replacement.id === current.id)) {
			throw new HttpError(400, 'A different replacement tool policy is required while this policy is assigned to users.')
		}

		for (const user of assignedUsers) {
			const binding = getUserPolicyBinding(user.id)
			if (binding && replacement) {
				setUserPolicyBinding({
					userId: user.id,
					toolPolicyId: replacement.id,
					filePolicyId: binding.filePolicyId
				})
			}
		}

		deleteToolPolicyRecord(current.id)
		return {
			deletedPolicyId: current.id,
			replacementPolicyId: replacement?.id || null
		}
	}

	createFilePolicy(payload) {
		return mapFilePolicyDetailed(createFilePolicy({
			name: String(payload.name || '').trim(),
			description: payload.description ? String(payload.description).trim() : null
		}))
	}

	updateFilePolicyRecord(policyId, payload) {
		const current = getFilePolicyById(policyId)
		if (!current) {
			throw new HttpError(404, 'File policy not found.')
		}
		if (current.isSystem) {
			throw new HttpError(400, 'System file policies cannot be edited.')
		}

		return mapFilePolicyDetailed(updateFilePolicy({
			id: current.id,
			name: String(payload.name || current.name).trim(),
			description: payload.description != null ? String(payload.description).trim() : current.description
		}))
	}

	deleteFilePolicy(policyId, replacementPolicyId) {
		const current = getFilePolicyById(policyId)
		if (!current) {
			throw new HttpError(404, 'File policy not found.')
		}
		if (current.isSystem) {
			throw new HttpError(400, 'System file policies cannot be deleted.')
		}

		const assignedUsers = listUsers().filter(user => {
			const binding = getUserPolicyBinding(user.id)
			return binding?.filePolicyId === current.id
		})
		const replacement = replacementPolicyId ? getFilePolicyById(replacementPolicyId) : null
		if (assignedUsers.length > 0 && (!replacement || replacement.id === current.id)) {
			throw new HttpError(400, 'A different replacement file policy is required while this policy is assigned to users.')
		}

		for (const user of assignedUsers) {
			const binding = getUserPolicyBinding(user.id)
			if (binding && replacement) {
				setUserPolicyBinding({
					userId: user.id,
					toolPolicyId: binding.toolPolicyId,
					filePolicyId: replacement.id
				})
			}
		}

		deleteFilePolicyRecord(current.id)
		return {
			deletedPolicyId: current.id,
			replacementPolicyId: replacement?.id || null
		}
	}

	addRootToFilePolicy(policyId, payload) {
		const policy = getFilePolicyById(policyId)
		if (!policy) {
			throw new HttpError(404, 'File policy not found.')
		}

		if (policy.isSystem) {
			throw new HttpError(400, 'System file policies cannot be edited.')
		}

		const scope = String(payload.scope || 'workspace').trim()
		if (scope !== 'workspace' && scope !== 'absolute') {
			throw new HttpError(400, 'scope must be workspace or absolute.')
		}

		const pathType = String(payload.pathType || 'dir').trim()
		if (pathType !== 'file' && pathType !== 'dir') {
			throw new HttpError(400, 'pathType must be file or dir.')
		}

		const rootPath = normalizeRootPath(payload.rootPath, scope)
		if (scope === 'absolute' && !fs.existsSync(rootPath)) {
			throw new HttpError(400, 'absolute rootPath must exist.')
		}

		return createFilePolicyRoot({
			policyId,
			scope,
			rootPath,
			pathType
		})
	}

	deleteRoot(rootId) {
		const root = getFilePolicyRootById(rootId)
		if (!root) {
			throw new HttpError(404, 'File policy root not found.')
		}
		const policy = getFilePolicyById(root.policyId)
		if (policy?.isSystem) {
			throw new HttpError(400, 'System file policies cannot be edited.')
		}
		deleteFilePolicyRootRecord(rootId)
	}

	probePath(targetPath) {
		const normalized = String(targetPath || '').trim()
		if (!normalized) {
			throw new HttpError(400, 'path is required.')
		}

		const isAbsolute = path.isAbsolute(normalized)
		const absolutePath = isAbsolute
			? path.resolve(normalized)
			: path.resolve(appConfig.projectRoot, normalized)
		const exists = fs.existsSync(absolutePath)
		const stats = exists ? fs.statSync(absolutePath) : null
		const workspaceRoot = path.resolve(appConfig.projectRoot)
		const isWorkspace = isWithinDirectory(workspaceRoot, absolutePath)

		return {
			inputPath: normalized,
			absolutePath,
			exists,
			isWorkspace,
			pathType: stats ? (stats.isDirectory() ? 'dir' : 'file') : null
		}
	}

	getAllowedToolNames(userId) {
		const binding = getUserPolicyBinding(userId)
		const policy = binding ? getToolPolicyById(binding.toolPolicyId) : getDefaultToolPolicy()
		return policy ? listToolPolicyTools(policy.id) : []
	}

	assertToolAllowed(userId, toolName) {
		const allowedTools = new Set(this.getAllowedToolNames(userId))
		if (!allowedTools.has(toolName)) {
			throw new HttpError(403, `Tool "${toolName}" is not permitted for this user.`)
		}
	}

	listAllowedToolDefinitions(userId, toolDefinitions) {
		const allowedTools = new Set(this.getAllowedToolNames(userId))
		return toolDefinitions.filter(tool => allowedTools.has(tool.name))
	}

	resolveFileAccess(userId, targetPath) {
		const binding = getUserPolicyBinding(userId)
		const filePolicy = binding ? getFilePolicyById(binding.filePolicyId) : getDefaultFilePolicy()
		const roots = listFilePolicyRoots(filePolicy.id)

		// カスタムポリシーでもデフォルトのワークスペースアクセスを常に保証する
		const defaultFilePolicy = getDefaultFilePolicy()
		if (filePolicy.id !== defaultFilePolicy.id) {
			const defaultRoots = listFilePolicyRoots(defaultFilePolicy.id)
			for (const defaultRoot of defaultRoots) {
				if (!roots.some(r => r.scope === defaultRoot.scope && r.rootPath === defaultRoot.rootPath)) {
					roots.push(defaultRoot)
				}
			}
		}

		const normalizedTarget = String(targetPath || '.').trim() || '.'
		const absoluteTarget = path.isAbsolute(normalizedTarget)
			? path.resolve(normalizedTarget)
			: path.resolve(appConfig.projectRoot, normalizedTarget)

		const matchedRoot = roots.find(root => {
			const rootAbsolute = root.scope === 'workspace'
				? path.resolve(appConfig.projectRoot, root.rootPath)
				: path.resolve(root.rootPath)
			if (root.pathType === 'file') {
				return canonicalizeComparablePath(rootAbsolute) === canonicalizeComparablePath(absoluteTarget)
			}
			return isWithinDirectory(rootAbsolute, absoluteTarget)
		})

		if (!matchedRoot) {
			throw new HttpError(403, 'The requested path is outside the assigned file policy roots.')
		}

		return {
			absolutePath: absoluteTarget,
			displayPath: path.isAbsolute(normalizedTarget)
				? absoluteTarget
				: path.relative(appConfig.projectRoot, absoluteTarget) || '.',
			scope: matchedRoot.scope,
			root: matchedRoot
		}
	}


	getExternalRoots(userId) {
		const binding = getUserPolicyBinding(userId)
		const filePolicy = binding ? getFilePolicyById(binding.filePolicyId) : getDefaultFilePolicy()
		const roots = listFilePolicyRoots(filePolicy.id)
		return roots.filter(root => root.scope === 'absolute')
	}

	getAdminOverview() {
		return {
			userCount: listUsers().length,
			pendingApprovalCount: listPendingApprovals().length,
			automationCount: listAutomations().length,
			toolPolicyCount: listToolPolicies().length,
			filePolicyCount: listFilePolicies().length,
			toolCatalogCount: this.getToolCatalog().length,
			protectionRuleCount: listProtectionRules().length
		}
	}
}
