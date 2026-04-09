import path from 'node:path'
import picomatch from 'picomatch'

const GLOB_PATTERN_MAX_LENGTH = 500

function compileGlob(pattern) {
	if (pattern.length > GLOB_PATTERN_MAX_LENGTH) {
		throw new Error(`Glob pattern exceeds maximum length of ${GLOB_PATTERN_MAX_LENGTH} characters.`)
	}
	if (/\*{3,}/.test(pattern)) {
		throw new Error('Glob patterns with 3 or more consecutive wildcards are not allowed.')
	}

	return picomatch.makeRe(pattern, { dot: true, nocase: true })
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
			return compileGlob(normalizedPattern).test(normalizedPath)
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
