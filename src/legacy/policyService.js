import fs from 'node:fs'
import path from 'node:path'
import {
	addFilePolicyRoot,
	deleteFilePolicy,
	deleteFilePolicyRoot,
	deleteToolPolicy,
	getAccountById,
	getAccountPolicyBindingByAccountId,
	getDefaultFilePolicy,
	getDefaultToolPolicy,
	getFilePolicyById,
	getFilePolicyByName,
	getFilePolicyRootById,
	getSessionByToken,
	getToolPolicyById,
	getToolPolicyByName,
	listAccountsByFilePolicyId,
	listAccountsByToolPolicyId,
	listFilePolicies,
	listFilePolicyRoots,
	listToolPolicies,
	listToolPolicyTools,
	reassignAccountsToFilePolicy,
	reassignAccountsToToolPolicy,
	replaceToolPolicyTools,
	setAccountPolicyBinding,
	touchAccountAuthRevision,
	updateFilePolicy as updateFilePolicyRecord,
	updateToolPolicy as updateToolPolicyRecord,
	createFilePolicy as createFilePolicyRecord,
	createToolPolicy as createToolPolicyRecord
} from './db.js'
import {
	DEFAULT_FILE_POLICY_NAME,
	DEFAULT_TOOL_POLICY_NAME,
	LOCAL_OPERATOR_ACCOUNT_ID
} from './policyDefaults.js'
import { getAccountWithPolicy } from './accountService.js'
import { getAllToolEntries, getToolCatalogSnapshot, getToolEntry } from './tools/catalog.js'
import { resolveToolPath } from './access/service.js'
import { PROJECT_ROOT_DIR, isPathInsideRoot } from '../tools/pathCommon.js'

const TOOL_PATH_INPUTS = Object.freeze({
	list_files: ['path'],
	read_file: ['path'],
	write_file: ['path'],
	make_dir: ['path'],
	delete_file: ['path'],
	move_file: ['from', 'to']
})

function makeDecision({
	decision,
	reasonCode,
	explain,
	toolPolicyId = null,
	filePolicyId = null
}) {
	return {
		decision,
		reasonCode,
		explain,
		toolPolicyId,
		filePolicyId,
		matchedPolicyId: toolPolicyId ?? filePolicyId,
		matchedPolicyVersion: null
	}
}

function ensurePolicyName(value, fieldName = 'name') {
	const normalized = String(value || '').trim()
	if (!normalized) {
		throw new Error(`${fieldName} is required.`)
	}

	return normalized
}

function ensureDescription(value) {
	return value == null ? null : String(value).trim()
}

function normalizeToolNames(toolNames = []) {
	if (!Array.isArray(toolNames)) {
		throw new Error('tools must be an array.')
	}

	return Array.from(
		new Set(
			toolNames
				.map(toolName => String(toolName || '').trim())
				.filter(Boolean)
		)
	)
}

function normalizeAbsolutePath(targetPath) {
	return path.resolve(String(targetPath || '').trim())
}

function validateToolNames(toolNames) {
	const knownToolNames = new Set(getAllToolEntries().map(tool => tool.name))
	for (const toolName of toolNames) {
		if (!knownToolNames.has(toolName)) {
			throw new Error(`Unknown tool: ${toolName}`)
		}
	}
}

function enrichToolPolicy(policy) {
	return {
		...policy,
		isSystem: Boolean(policy.isSystem),
		tools: listToolPolicyTools(policy.id)
	}
}

function enrichFilePolicy(policy) {
	return {
		...policy,
		isSystem: Boolean(policy.isSystem),
		roots: listFilePolicyRoots(policy.id)
	}
}

function touchAccounts(accounts) {
	for (const account of accounts) {
		touchAccountAuthRevision(account.id)
	}
}

function resolveSessionAccountId(sessionToken) {
	const session = getSessionByToken(sessionToken)
	return session?.operator_account_id || LOCAL_OPERATOR_ACCOUNT_ID
}

function getBindingDetails(accountId) {
	const account = getAccountById(accountId)
	if (!account) {
		return null
	}

	const binding = getAccountPolicyBindingByAccountId(accountId)
	if (!binding) {
		return null
	}

	return {
		account,
		binding,
		toolPolicy: getToolPolicyById(binding.toolPolicyId),
		filePolicy: getFilePolicyById(binding.filePolicyId)
	}
}

function assertAdminSession(sessionToken) {
	const account = getAccountWithPolicy(resolveSessionAccountId(sessionToken))
	if (!account?.isAdmin || account.status !== 'active') {
		throw new Error('Admin privileges are required.')
	}
	return account
}

function ensureReplacementToolPolicy(policyId) {
	const defaultPolicy = getDefaultToolPolicy()
	if (policyId == null) {
		return defaultPolicy
	}

	const replacement = getToolPolicyById(policyId)
	return replacement || defaultPolicy
}

function ensureReplacementFilePolicy(policyId) {
	const defaultPolicy = getDefaultFilePolicy()
	if (policyId == null) {
		return defaultPolicy
	}

	const replacement = getFilePolicyById(policyId)
	return replacement || defaultPolicy
}

function buildResourceSummary(resolved) {
	return {
		type: 'path',
		scope: resolved.scope,
		path: resolved.displayPath
	}
}

function toolUsesPath(toolName) {
	return Object.prototype.hasOwnProperty.call(TOOL_PATH_INPUTS, toolName)
}

function getPathAction(toolName, fieldName) {
	if (toolName === 'list_files') {
		return 'discover'
	}

	if (toolName === 'read_file') {
		return 'read'
	}

	if (toolName === 'delete_file') {
		return 'delete'
	}

	if (toolName === 'move_file') {
		return fieldName === 'from' ? 'move' : 'write'
	}

	return 'write'
}

export function listToolPoliciesDetailed() {
	return listToolPolicies().map(enrichToolPolicy)
}

export function listFilePoliciesDetailed() {
	return listFilePolicies().map(enrichFilePolicy)
}

export function createToolPolicy({
	name,
	description = null,
	tools = []
}) {
	const normalizedName = ensurePolicyName(name)
	const normalizedTools = normalizeToolNames(tools)
	validateToolNames(normalizedTools)

	const policy = createToolPolicyRecord({
		name: normalizedName,
		description: ensureDescription(description),
		isSystem: false
	})

	replaceToolPolicyTools(policy.id, normalizedTools)
	return enrichToolPolicy(policy)
}

export function updateToolPolicy(policyId, {
	name,
	description,
	tools
}) {
	const current = getToolPolicyById(policyId)
	if (!current) {
		throw new Error(`Unknown tool policy: ${policyId}`)
	}

	const nextTools = tools == null
		? listToolPolicyTools(policyId)
		: normalizeToolNames(tools)
	validateToolNames(nextTools)

	updateToolPolicyRecord({
		id: policyId,
		name: name != null ? ensurePolicyName(name) : current.name,
		description: description != null ? ensureDescription(description) : current.description
	})
	replaceToolPolicyTools(policyId, nextTools)

	touchAccounts(listAccountsByToolPolicyId(policyId))
	return enrichToolPolicy(getToolPolicyById(policyId))
}

export function deleteToolPolicyWithReplacement(policyId, replacementPolicyId = null) {
	const current = getToolPolicyById(policyId)
	if (!current) {
		throw new Error(`Unknown tool policy: ${policyId}`)
	}

	if (current.isSystem) {
		throw new Error('System tool policies cannot be deleted.')
	}

	const replacement = ensureReplacementToolPolicy(replacementPolicyId)
	if (!replacement || replacement.id === current.id) {
		throw new Error('A different replacement tool policy is required.')
	}

	const affectedAccounts = listAccountsByToolPolicyId(current.id)
	reassignAccountsToToolPolicy(current.id, replacement.id)
	deleteToolPolicy(current.id)
	touchAccounts(affectedAccounts)

	return {
		deletedPolicyId: current.id,
		replacementPolicyId: replacement.id,
		reassignedAccountIds: affectedAccounts.map(account => account.id)
	}
}

export function createFilePolicy({
	name,
	description = null
}) {
	const policy = createFilePolicyRecord({
		name: ensurePolicyName(name),
		description: ensureDescription(description),
		isSystem: false
	})

	return enrichFilePolicy(policy)
}

export function updateFilePolicy(policyId, {
	name,
	description
}) {
	const current = getFilePolicyById(policyId)
	if (!current) {
		throw new Error(`Unknown file policy: ${policyId}`)
	}

	updateFilePolicyRecord({
		id: policyId,
		name: name != null ? ensurePolicyName(name) : current.name,
		description: description != null ? ensureDescription(description) : current.description
	})

	return enrichFilePolicy(getFilePolicyById(policyId))
}

export function addRootToFilePolicy(policyId, {
	absolutePath,
	pathType
}) {
	const policy = getFilePolicyById(policyId)
	if (!policy) {
		throw new Error(`Unknown file policy: ${policyId}`)
	}

	const normalizedPathType = String(pathType || '').trim()
	if (normalizedPathType !== 'file' && normalizedPathType !== 'dir') {
		throw new Error('pathType must be file or dir.')
	}

	const normalizedAbsolutePath = normalizeAbsolutePath(absolutePath)
	if (!path.isAbsolute(normalizedAbsolutePath)) {
		throw new Error('absolutePath must be absolute.')
	}

	if (!fs.existsSync(normalizedAbsolutePath)) {
		throw new Error('absolutePath must exist.')
	}

	if (isPathInsideRoot(PROJECT_ROOT_DIR, normalizedAbsolutePath)) {
		throw new Error('Workspace paths do not need to be added to a file policy.')
	}

	const stats = fs.statSync(normalizedAbsolutePath)
	if (normalizedPathType === 'file' && !stats.isFile()) {
		throw new Error('absolutePath is not a file.')
	}

	if (normalizedPathType === 'dir' && !stats.isDirectory()) {
		throw new Error('absolutePath is not a directory.')
	}

	addFilePolicyRoot({
		filePolicyId: policyId,
		absolutePath: normalizedAbsolutePath,
		pathType: normalizedPathType
	})

	touchAccounts(listAccountsByFilePolicyId(policyId))
	return enrichFilePolicy(getFilePolicyById(policyId))
}

export function removeRootFromFilePolicy(policyId, rootId) {
	const policy = getFilePolicyById(policyId)
	if (!policy) {
		throw new Error(`Unknown file policy: ${policyId}`)
	}

	const root = getFilePolicyRootById(rootId)
	if (!root || root.filePolicyId !== policyId) {
		throw new Error(`Unknown file policy root: ${rootId}`)
	}

	deleteFilePolicyRoot(rootId)
	touchAccounts(listAccountsByFilePolicyId(policyId))
	return enrichFilePolicy(getFilePolicyById(policyId))
}

export function deleteFilePolicyWithReplacement(policyId, replacementPolicyId = null) {
	const current = getFilePolicyById(policyId)
	if (!current) {
		throw new Error(`Unknown file policy: ${policyId}`)
	}

	if (current.isSystem) {
		throw new Error('System file policies cannot be deleted.')
	}

	const replacement = ensureReplacementFilePolicy(replacementPolicyId)
	if (!replacement || replacement.id === current.id) {
		throw new Error('A different replacement file policy is required.')
	}

	const affectedAccounts = listAccountsByFilePolicyId(current.id)
	reassignAccountsToFilePolicy(current.id, replacement.id)
	deleteFilePolicy(current.id)
	touchAccounts(affectedAccounts)

	return {
		deletedPolicyId: current.id,
		replacementPolicyId: replacement.id,
		reassignedAccountIds: affectedAccounts.map(account => account.id)
	}
}

export function canAccountUseTool(accountId, toolName) {
	const details = getBindingDetails(accountId)
	if (!details || details.account.status !== 'active') {
		return false
	}

	return listToolPolicyTools(details.toolPolicy.id).includes(toolName)
}

export function getCurrentAuthRevision(accountId) {
	const account = getAccountById(accountId)
	return account?.authRevision ?? 0
}

export function getSessionOperatorAccountId(sessionToken) {
	return resolveSessionAccountId(sessionToken)
}

export function getLocalOperatorAccount() {
	return getAccountWithPolicy(LOCAL_OPERATOR_ACCOUNT_ID)
}

export function authorizeToolRequest({
	sessionToken,
	toolName,
	input = {}
}) {
	const accountId = resolveSessionAccountId(sessionToken)
	const details = getBindingDetails(accountId)

	if (!details) {
		return {
			accountId,
			resource: null,
			resources: [],
			decision: makeDecision({
				decision: 'ERROR',
				reasonCode: 'account_missing',
				explain: 'The operator account could not be resolved.'
			})
		}
	}

	if (details.account.status !== 'active') {
		return {
			accountId,
			resource: null,
			resources: [],
			decision: makeDecision({
				decision: 'DENY',
				reasonCode: 'account_inactive',
				explain: 'The operator account is disabled.',
				toolPolicyId: details.toolPolicy.id,
				filePolicyId: details.filePolicy.id
			})
		}
	}

	const toolEntry = getToolEntry(toolName)
	if (!toolEntry) {
		return {
			accountId,
			resource: null,
			resources: [],
			decision: makeDecision({
				decision: 'ERROR',
				reasonCode: 'tool_unknown',
				explain: `Tool ${toolName} is not registered.`,
				toolPolicyId: details.toolPolicy.id,
				filePolicyId: details.filePolicy.id
			})
		}
	}

	if (!canAccountUseTool(accountId, toolName)) {
		return {
			accountId,
			resource: null,
			resources: [],
			decision: makeDecision({
				decision: 'DENY',
				reasonCode: 'tool_policy_denied',
				explain: `${toolName} is not enabled by the assigned tool policy.`,
				toolPolicyId: details.toolPolicy.id,
				filePolicyId: details.filePolicy.id
			})
		}
	}

	const pathInputs = TOOL_PATH_INPUTS[toolName] || []
	const resources = []

	for (const fieldName of pathInputs) {
		const targetPath = input[fieldName]
		const resolved = resolveToolPath(targetPath, {
			action: getPathAction(toolName, fieldName),
			sessionToken,
			accountId
		})
		resources.push(buildResourceSummary(resolved))
	}

	return {
		accountId,
		resource: resources[0] || null,
		resources,
		decision: makeDecision({
			decision: 'ALLOW',
			reasonCode: 'allowed',
			explain: 'The requested tool is allowed.',
			toolPolicyId: details.toolPolicy.id,
			filePolicyId: details.filePolicy.id
		})
	}
}

export function createToolAuthorizationFailure(decision, toolName, resource) {
	return {
		ok: false,
		code: decision.decision === 'ERROR' ? 'POLICY_ERROR' : 'POLICY_DENY',
		error: decision.decision === 'ERROR'
			? 'Policy evaluation failed.'
			: 'Tool access was denied.',
		decision: decision.decision,
		reasonCode: decision.reasonCode,
		explain: decision.explain,
		toolPolicyId: decision.toolPolicyId ?? null,
		filePolicyId: decision.filePolicyId ?? null,
		toolName,
		resource
	}
}

export function getToolCatalog() {
	return getToolCatalogSnapshot()
}

export function canManagePolicies(sessionToken) {
	const account = getAccountWithPolicy(resolveSessionAccountId(sessionToken))
	const allowed = Boolean(account?.isAdmin && account.status === 'active')

	return {
		accountId: account?.id || resolveSessionAccountId(sessionToken),
		decision: makeDecision({
			decision: allowed ? 'ALLOW' : 'DENY',
			reasonCode: allowed ? 'admin_allowed' : 'admin_required',
			explain: allowed
				? 'The current account can manage policies.'
				: 'Admin privileges are required to manage policies.'
		})
	}
}

export function canManageAdmin(sessionToken) {
	return canManagePolicies(sessionToken)
}

export function assignAccountPolicies(accountId, {
	toolPolicyId,
	filePolicyId
}) {
	const details = getBindingDetails(accountId)
	if (!details) {
		throw new Error(`Unknown account: ${accountId}`)
	}

	const nextToolPolicy = toolPolicyId != null
		? getToolPolicyById(toolPolicyId)
		: details.toolPolicy
	const nextFilePolicy = filePolicyId != null
		? getFilePolicyById(filePolicyId)
		: details.filePolicy

	if (!nextToolPolicy) {
		throw new Error(`Unknown tool policy: ${toolPolicyId}`)
	}

	if (!nextFilePolicy) {
		throw new Error(`Unknown file policy: ${filePolicyId}`)
	}

	setAccountPolicyBinding({
		accountId,
		toolPolicyId: nextToolPolicy.id,
		filePolicyId: nextFilePolicy.id
	})
	touchAccountAuthRevision(accountId)

	return getAccountWithPolicy(accountId)
}

export function getToolAuthorizationForPath({
	sessionToken,
	toolName,
	targetPath
}) {
	const accountId = resolveSessionAccountId(sessionToken)
	const pathField = toolName === 'move_file' ? 'from' : 'path'
	return authorizeToolRequest({
		sessionToken,
		toolName,
		input: {
			[pathField]: targetPath,
			...(toolName === 'move_file' ? { to: targetPath } : {})
		}
	})
}

export function getToolAuthorizationForAccountPath({
	accountId,
	toolName,
	targetPath
}) {
	const details = getBindingDetails(accountId)
	if (!details) {
		throw new Error(`Unknown account: ${accountId}`)
	}

	if (!canAccountUseTool(accountId, toolName)) {
		return {
			accountId,
			resource: null,
			resources: [],
			decision: makeDecision({
				decision: 'DENY',
				reasonCode: 'tool_policy_denied',
				explain: `${toolName} is not enabled by the assigned tool policy.`,
				toolPolicyId: details.toolPolicy.id,
				filePolicyId: details.filePolicy.id
			})
		}
	}

	const fieldName = toolName === 'move_file' ? 'from' : 'path'
	const resolved = toolUsesPath(toolName)
		? resolveToolPath(targetPath, {
			action: getPathAction(toolName, fieldName),
			accountId
		})
		: null

	return {
		accountId,
		resource: resolved ? buildResourceSummary(resolved) : null,
		resources: resolved ? [buildResourceSummary(resolved)] : [],
		decision: makeDecision({
			decision: 'ALLOW',
			reasonCode: 'allowed',
			explain: 'The requested tool is allowed.',
			toolPolicyId: details.toolPolicy.id,
			filePolicyId: details.filePolicy.id
		}),
		fieldName
	}
}

export function getPolicyApprovalSummary() {
	return []
}

export function createPolicyApplyApproval() {
	throw new Error('Legacy policy approvals are not supported in the redesigned policy system.')
}

export function applyPolicyVersion() {
	throw new Error('Legacy versioned policies are not supported in the redesigned policy system.')
}

export function createPolicyAssignmentApproval() {
	return {
		id: 'not-required',
		status: 'approved'
	}
}

export function assignPolicyToAccount() {
	throw new Error('Use account policy bindings instead of the legacy single-policy assignment API.')
}

export function listPoliciesWithVersions() {
	return []
}

export function getPolicyDetails() {
	throw new Error('Legacy versioned policy details are not supported in the redesigned policy system.')
}

export function getPolicyDiffPreview() {
	throw new Error('Legacy versioned policy diff is not supported in the redesigned policy system.')
}

export function importPolicyVersion() {
	throw new Error('Legacy policy import is not supported in the redesigned policy system.')
}

export function reverseLookupAccount() {
	throw new Error('Reverse lookup was removed in the redesigned policy system.')
}

export function reverseLookupPath() {
	throw new Error('Reverse lookup was removed in the redesigned policy system.')
}

export function reverseLookupPathForAccount() {
	throw new Error('Reverse lookup was removed in the redesigned policy system.')
}

export function recoverAdminPolicy() {
	return {
		account: getLocalOperatorAccount(),
		policy: {
			name: 'system-all-tools'
		}
	}
}

export function getToolPathInputs(toolName) {
	return TOOL_PATH_INPUTS[toolName] || []
}

export function getDefaultPolicyNames() {
	return {
		toolPolicyName: DEFAULT_TOOL_POLICY_NAME,
		filePolicyName: DEFAULT_FILE_POLICY_NAME
	}
}

export function assertAdminAccess(sessionToken) {
	return assertAdminSession(sessionToken)
}
