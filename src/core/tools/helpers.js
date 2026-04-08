import fs from 'node:fs'
import path from 'node:path'
import { appConfig } from '../config.js'
import { assertPathActionAllowed, filterDiscoverableEntries, createProtectionResult } from '../../protection/service.js'

export function getTextPreview(text, maxLength = 400) {
	const normalized = String(text || '')
	if (normalized.length <= maxLength) {
		return normalized
	}

	return `${normalized.slice(0, maxLength)}...`
}

export function resolveThroughExistingAncestor(targetPath) {
	const resolved = path.resolve(appConfig.projectRoot, String(targetPath || '.'))
	let cursor = resolved
	const pending = []

	while (!fs.existsSync(cursor)) {
		const parent = path.dirname(cursor)
		if (parent === cursor) {
			break
		}
		pending.unshift(path.basename(cursor))
		cursor = parent
	}

	const basePath = fs.existsSync(cursor)
		? fs.realpathSync.native(cursor)
		: cursor

	return pending.length > 0 ? path.resolve(basePath, ...pending) : basePath
}

export function resolveProjectPath(targetPath = '.', context = {}) {
	if (context.policyService && context.userId) {
		const result = context.policyService.resolveFileAccess(context.userId, targetPath)
		assertPathActionAllowed(result.displayPath, context.action || 'read')
		return result
	}

	const rawPath = String(targetPath || '.').trim() || '.'
	const absolute = path.resolve(appConfig.projectRoot, rawPath)
	const canonical = resolveThroughExistingAncestor(rawPath)
	const normalizedRoot = process.platform === 'win32'
		? appConfig.projectRoot.toLowerCase()
		: appConfig.projectRoot
	const normalizedCanonical = process.platform === 'win32'
		? canonical.toLowerCase()
		: canonical

	if (
		normalizedCanonical !== normalizedRoot &&
		!normalizedCanonical.startsWith(`${normalizedRoot}${path.sep}`)
	) {
		throw new Error('Path resolves outside the configured project root.')
	}

	const displayPath = path.relative(appConfig.projectRoot, absolute) || '.'
	assertPathActionAllowed(displayPath, context.action || 'read')

	return {
		rawPath,
		absolutePath: absolute,
		displayPath
	}
}

export function createApprovalResponse(toolName, input, reason) {
	return {
		ok: false,
		approvalRequired: true,
		toolName,
		input,
		reason
	}
}

export { assertPathActionAllowed, filterDiscoverableEntries, createProtectionResult }
