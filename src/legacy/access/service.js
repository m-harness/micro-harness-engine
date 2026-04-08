import fs from 'node:fs'
import path from 'node:path'
import {
	getAccountPolicyBindingByAccountId,
	getFilePolicyById,
	getSessionByToken,
	listFilePolicyRoots
} from '../db.js'
import { LOCAL_OPERATOR_ACCOUNT_ID } from '../policyDefaults.js'
import { assertPathActionAllowed } from '../../protection/service.js'
import {
	PROJECT_ROOT_DIR,
	isPathInsideRoot,
	resolveWorkspacePath,
	toProjectRelativePath
} from '../../tools/pathCommon.js'
import { AccessError } from './errors.js'

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

function isPathInsideDirectory(directoryPath, targetPath) {
	const normalizedDirectory = canonicalizeComparablePath(directoryPath)
	const normalizedTarget = canonicalizeComparablePath(targetPath)
	const relativePath = path.relative(normalizedDirectory, normalizedTarget)

	return (
		relativePath === '' ||
		(
			relativePath !== '..' &&
			!relativePath.startsWith(`..${path.sep}`) &&
			relativePath !== '../' &&
			!relativePath.startsWith('../') &&
			!path.isAbsolute(relativePath)
		)
	)
}

function matchesRoot(root, targetPath) {
	if (root.pathType === 'file') {
		return canonicalizeComparablePath(root.absolutePath) === canonicalizeComparablePath(targetPath)
	}

	return isPathInsideDirectory(root.absolutePath, targetPath)
}

function getAccountFilePolicy(accountId) {
	if (!accountId) {
		return null
	}

	const binding = getAccountPolicyBindingByAccountId(accountId)
	if (!binding) {
		return null
	}

	const filePolicy = getFilePolicyById(binding.filePolicyId)
	if (!filePolicy) {
		return null
	}

	return {
		policy: filePolicy,
		roots: listFilePolicyRoots(filePolicy.id)
	}
}

function resolveAccountId(options = {}) {
	if (options.accountId) {
		return options.accountId
	}

	if (options.sessionToken) {
		const session = getSessionByToken(options.sessionToken)
		return session?.operator_account_id || LOCAL_OPERATOR_ACCOUNT_ID
	}

	return null
}

function resolveWorkspaceToolPath(targetPath, options = {}) {
	const { resolved, relativePath } = resolveWorkspacePath(targetPath)

	if (!isPathInsideDirectory(PROJECT_ROOT_DIR, resolved)) {
		throw new AccessError(
			'The requested workspace path resolves outside the project root.',
			{
				action: options.action,
				targetPath: resolved,
				reason: 'workspace_escape',
				scope: 'workspace'
			}
		)
	}

	if (options.action) {
		assertPathActionAllowed(relativePath, options.action, {
			sessionToken: options.sessionToken
		})
	}

	return {
		absolutePath: resolved,
		displayPath: relativePath,
		scope: 'workspace',
		filePolicyId: null
	}
}

function resolveExternalToolPath(targetPath, options = {}) {
	const resolved = path.resolve(targetPath)
	const filePolicy = getAccountFilePolicy(resolveAccountId(options))

	if (!filePolicy) {
		throw new AccessError(
			'The current account does not have a file policy binding.',
			{
				action: options.action,
				targetPath: resolved,
				reason: 'file_policy_missing',
				scope: 'external'
			}
		)
	}

	const matchedRoot = filePolicy.roots.find(root => matchesRoot(root, resolved))
	if (!matchedRoot) {
		throw new AccessError(
			'The requested path is outside the allowed file policy roots.',
			{
				action: options.action,
				targetPath: resolved,
				reason: 'file_policy_denied',
				scope: 'external'
			}
		)
	}

	assertPathActionAllowed(resolved, options.action || 'read', {
		sessionToken: options.sessionToken
	})

	return {
		absolutePath: resolved,
		displayPath: resolved,
		scope: 'external',
		filePolicyId: filePolicy.policy.id,
		matchedRoot
	}
}

export function resolveToolPath(targetPath = '.', options = {}) {
	const normalizedTargetPath = String(targetPath || '.').trim() || '.'

	if (!path.isAbsolute(normalizedTargetPath)) {
		return resolveWorkspaceToolPath(normalizedTargetPath, options)
	}

	if (isPathInsideRoot(PROJECT_ROOT_DIR, normalizedTargetPath)) {
		return resolveWorkspaceToolPath(
			toProjectRelativePath(path.resolve(normalizedTargetPath)),
			options
		)
	}

	return resolveExternalToolPath(normalizedTargetPath, options)
}

export function createAccessDeniedResult(error) {
	return {
		ok: false,
		code: error.code || 'ACCESS_DENIED',
		error: error.message,
		userActionRequired: error.userActionRequired !== false,
		action: error.action || null,
		path: error.targetPath || null,
		scope: error.scope || null,
		reason: error.reason || 'access_denied',
		message: 'This path is outside the allowed file policy roots.'
	}
}
