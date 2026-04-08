import {
	assertPathActionAllowed,
	filterDiscoverableEntries
} from '../../protection/service.js'
import {
	PROJECT_ROOT_DIR,
	normalizeRelativeProjectPath,
	resolveWorkspacePath,
	toProjectRelativePath
} from '../../tools/pathCommon.js'

export function resolveProjectPath(targetPath = '.', options = {}) {
	const { resolved, relativePath } = resolveWorkspacePath(targetPath)

	if (options.action) {
		assertPathActionAllowed(
			relativePath,
			options.action,
			{
				sessionToken: options.sessionToken
			}
		)
	}

	return resolved
}

export function getTextPreview(text, maxLength = 500) {
	if (typeof text !== 'string') {
		return ''
	}

	if (text.length <= maxLength) {
		return text
	}

	return `${text.slice(0, maxLength)}...`
}

export function filterProtectedEntries(baseRelativePath, entries, options = {}) {
	return filterDiscoverableEntries(
		normalizeRelativeProjectPath(baseRelativePath),
		entries,
		options
	)
}
