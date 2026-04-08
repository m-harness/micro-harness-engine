import path from 'node:path'

function escapeRegex(value) {
	return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

const GLOB_PATTERN_MAX_LENGTH = 500

function globToRegExp(pattern) {
	if (pattern.length > GLOB_PATTERN_MAX_LENGTH) {
		throw new Error(`Glob pattern exceeds maximum length of ${GLOB_PATTERN_MAX_LENGTH} characters.`)
	}
	if (/\*{3,}/.test(pattern)) {
		throw new Error('Glob patterns with 3 or more consecutive wildcards are not allowed.')
	}

	let regex = '^'

	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index]
		const next = pattern[index + 1]

		if (char === '*') {
			if (next === '*') {
				regex += '.*'
				index += 1
			} else {
				regex += '[^/]*'
			}

			continue
		}

		regex += escapeRegex(char)
	}

	regex += '$'
	return new RegExp(regex, 'i')
}

export function normalizeProtectionPath(targetPath = '.') {
	const raw = String(targetPath || '.')

	if (path.isAbsolute(raw)) {
		const resolved = path.resolve(raw)
		return resolved.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
	}

	const slashNormalized = raw.replace(/\\/g, '/')
	const posixNormalized = path.posix.normalize(slashNormalized)

	if (posixNormalized.startsWith('../') || posixNormalized === '..') {
		return ''
	}

	const cleaned = posixNormalized.startsWith('./')
		? posixNormalized.slice(2)
		: posixNormalized

	return cleaned || '.'
}

export function matchesProtectionRule(rule, targetPath) {
	const normalizedPath = normalizeProtectionPath(targetPath)
	if (!normalizedPath) {
		return false
	}
	const normalizedPattern = normalizeProtectionPath(rule.pattern)

	if (rule.patternType === 'exact') {
		return normalizedPath.toLowerCase() === normalizedPattern.toLowerCase()
	}

	if (rule.patternType === 'dirname') {
		return (
			normalizedPath.toLowerCase() === normalizedPattern.toLowerCase() ||
			normalizedPath.toLowerCase().startsWith(`${normalizedPattern.toLowerCase()}/`)
		)
	}

	if (rule.patternType === 'glob') {
		try {
			return globToRegExp(normalizedPattern).test(normalizedPath)
		} catch {
			return false
		}
	}

	return false
}

export function compareRulePriority(left, right) {
	if (left.priority !== right.priority) {
		return left.priority - right.priority
	}

	return left.id - right.id
}
