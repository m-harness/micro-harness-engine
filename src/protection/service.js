import {
	createProtectionRule,
	deleteProtectionRule,
	getProtectionRules,
	saveProtectionAuditLog,
	setProtectionRuleEnabled
} from '../core/store.js'
import {
	compareRulePriority,
	matchesProtectionRule,
	normalizeProtectionPath
} from './matcher.js'
import { redactSensitiveText, redactSensitiveValue } from './classifier.js'
import { ProtectionError } from './errors.js'

function selectWinningRule(rules) {
	if (!rules.length) {
		return null
	}

	return [...rules].sort((left, right) => {
		return compareRulePriority(left, right)
	})[0]
}

export function listProtectionRules() {
	return getProtectionRules()
}

export function addProtectionRule({
	pattern,
	patternType,
	scope = 'workspace',
	priority = 100,
	note = null
}) {
	return createProtectionRule({
		pattern,
		patternType,
		effect: 'deny',
		scope,
		priority,
		note
	})
}

export function enableProtectionRule(ruleId) {
	return setProtectionRuleEnabled(ruleId, true)
}

export function disableProtectionRule(ruleId) {
	return setProtectionRuleEnabled(ruleId, false)
}

export function removeProtectionRule(ruleId) {
	return deleteProtectionRule(ruleId)
}

export function evaluateProtection({
	action,
	targetPath = null,
	logDecision = true,
	sessionToken = null,
	sink = null
}) {
	const normalizedPath = targetPath ? normalizeProtectionPath(targetPath) : null
	const matchingRules = getProtectionRules({ enabledOnly: true }).filter(rule => {
		if (!normalizedPath) {
			return false
		}

		return matchesProtectionRule(rule, normalizedPath)
	})

	const matchedRule = selectWinningRule(matchingRules)
	// Design note (M-1): Protection Engine uses default-allow by design.
	// Path-level deny rules are defined here; the File PolicyService handles
	// workspace root scoping and external-root allow-listing independently.
	// Together they implement defence-in-depth without duplicating logic.
	const effect = matchedRule?.effect || 'allow'

	if (logDecision && effect !== 'allow') {
		saveProtectionAuditLog({
			sessionToken,
			action,
			targetPath: normalizedPath,
			sink,
			decision: effect,
			matchedRuleId: matchedRule?.id || null,
			reason: matchedRule
				? `Matched ${matchedRule.patternType}:${matchedRule.pattern}`
				: 'No matching rule metadata.'
		})
	}

	return {
		effect,
		rule: matchedRule,
		targetPath: normalizedPath
	}
}

export function assertPathActionAllowed(targetPath, action, options = {}) {
	const decision = evaluateProtection({
		action,
		targetPath,
		logDecision: options.logDecision !== false,
		sessionToken: options.sessionToken || null
	})

	if (decision.effect === 'allow') {
		return decision
	}

	const targetLabel = decision.targetPath || targetPath || 'target'
	const effectLabel = decision.effect === 'ask'
		? 'requires user handling'
		: 'is protected'

	throw new ProtectionError(
		`The requested ${action} operation for "${targetLabel}" ${effectLabel}. Ask the user to handle it manually.`,
		{
			action,
			targetPath: decision.targetPath,
			effect: decision.effect,
			rule: decision.rule
		}
	)
}

export function filterDiscoverableEntries(baseRelativePath, entries, options = {}) {
	const visibleEntries = []
	let hiddenCount = 0

	for (const entry of entries) {
		const relativePath = baseRelativePath === '.'
			? entry.name
			: `${normalizeProtectionPath(baseRelativePath)}/${entry.name}`
		const decision = evaluateProtection({
			action: 'discover',
			targetPath: relativePath,
			logDecision: false,
			sessionToken: options.sessionToken || null
		})

		if (decision.effect === 'allow') {
			visibleEntries.push(entry)
			continue
		}

		hiddenCount += 1
	}

	return {
		entries: visibleEntries,
		hiddenCount
	}
}

export function sanitizeMessagesForModel(messages) {
	return messages.map(message => {
		if (typeof message.content === 'string') {
			return {
				...message,
				content: redactSensitiveText(message.content)
			}
		}

		if (Array.isArray(message.content)) {
			return {
				...message,
				content: message.content.map(block => {
					if (block.type === 'text') {
						return {
							...block,
							text: redactSensitiveText(block.text)
						}
					}

					if (typeof block.content === 'string') {
						return {
							...block,
							content: redactSensitiveText(block.content)
						}
					}

					return block
				})
			}
		}

		return message
	})
}

export function sanitizeToolResultForModel(result) {
	return redactSensitiveValue(result)
}

export function redactForPersistence(value) {
	return redactSensitiveValue(value)
}

export function redactTextForPersistence(text) {
	return redactSensitiveText(text)
}

export function createProtectionResult(error) {
	return {
		ok: false,
		code: error.code || 'PROTECTED_PATH',
		error: error.message,
		userActionRequired: error.userActionRequired !== false,
		action: error.action || null,
		path: error.targetPath || null,
		effect: error.effect || 'deny',
		ruleId: error.rule?.id || null,
		message: 'This path is protected. Ask the user to handle it manually.'
	}
}
