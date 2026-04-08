import {
	addProtectionRule,
	disableProtectionRule,
	enableProtectionRule,
	evaluateProtection,
	listProtectionRules,
	removeProtectionRule
} from './service.js'
import { normalizeProtectionPath } from './matcher.js'

function resolvePatternType(kind) {
	if (kind === 'path') {
		return 'exact'
	}

	if (kind === 'dir') {
		return 'dirname'
	}

	if (kind === 'glob') {
		return 'glob'
	}

	return null
}

function sortRulesForDisplay(rules) {
	return [...rules].sort((left, right) => {
		if (left.enabled !== right.enabled) {
			return left.enabled ? -1 : 1
		}

		if (left.priority !== right.priority) {
			return left.priority - right.priority
		}

		return left.id - right.id
	})
}

export function listProtectionRulesApi() {
	return {
		ok: true,
		rules: sortRulesForDisplay(listProtectionRules())
	}
}

export function createProtectionRuleApi({
	kind,
	pattern,
	scope = 'workspace',
	priority = 100
}) {
	const patternType = resolvePatternType(kind)

	if (!patternType) {
		return {
			ok: false,
			error: `Unsupported protection kind: ${kind}`
		}
	}

	if (!pattern || !String(pattern).trim()) {
		return {
			ok: false,
			error: 'A protection pattern is required.'
		}
	}

	const createdRule = addProtectionRule({
		pattern: String(pattern).trim(),
		patternType,
		scope,
		priority
	})

	return {
		ok: true,
		kind,
		pattern: String(pattern).trim(),
		rule: createdRule,
		message: `Saved protection rule for "${String(pattern).trim()}".`
	}
}

export function setProtectionRuleEnabledApi(ruleId, enabled) {
	if (typeof ruleId !== 'string' || !ruleId.trim()) {
		return {
			ok: false,
			error: 'A valid rule id is required.'
		}
	}

	if (enabled) {
		enableProtectionRule(ruleId)
	} else {
		disableProtectionRule(ruleId)
	}

	return {
		ok: true,
		ruleId,
		enabled,
		message: `${enabled ? 'Enabled' : 'Disabled'} protection rule #${ruleId}.`
	}
}

export function removeProtectionRuleApi(ruleId) {
	if (typeof ruleId !== 'string' || !ruleId.trim()) {
		return {
			ok: false,
			error: 'A valid rule id is required.'
		}
	}

	removeProtectionRule(ruleId)

	return {
		ok: true,
		ruleId,
		message: `Removed protection rule #${ruleId}.`
	}
}

export function inspectProtectionPathApi(targetPath) {
	if (!targetPath || !String(targetPath).trim()) {
		return {
			ok: false,
			error: 'A path is required.'
		}
	}

	const normalizedPath = normalizeProtectionPath(targetPath)
	const result = evaluateProtection({
		action: 'any',
		targetPath: normalizedPath,
		logDecision: false
	})

	return {
		ok: true,
		path: normalizedPath,
		protected: result.effect !== 'allow',
		effect: result.effect,
		ruleId: result.rule?.id || null,
		pattern: result.rule ? `${result.rule.patternType}:${result.rule.pattern}` : null
	}
}
