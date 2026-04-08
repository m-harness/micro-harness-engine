const VALID_DECISIONS = new Set(['deny', 'allow'])
const VALID_EFFECTS = new Set(['allow', 'deny'])
const VALID_SCOPES = new Set(['workspace', 'external', 'any'])

function isPlainObject(value) {
	return value != null && typeof value === 'object' && !Array.isArray(value)
}

function ensureArray(value) {
	return Array.isArray(value) ? value : []
}

export function validatePolicyDocument(document) {
	const errors = []

	if (!isPlainObject(document)) {
		return {
			ok: false,
			errors: ['Policy document must be an object.']
		}
	}

	if (document.version !== 1) {
		errors.push('Policy version must be exactly 1.')
	}

	if (!VALID_DECISIONS.has(document.defaultDecision)) {
		errors.push('defaultDecision must be "allow" or "deny".')
	}

	if (!Array.isArray(document.rules)) {
		errors.push('rules must be an array.')
	}

	for (const [index, rule] of ensureArray(document.rules).entries()) {
		const prefix = `rules[${index}]`

		if (!isPlainObject(rule)) {
			errors.push(`${prefix} must be an object.`)
			continue
		}

		if (!String(rule.id || '').trim()) {
			errors.push(`${prefix}.id is required.`)
		}

		if (!VALID_EFFECTS.has(rule.effect)) {
			errors.push(`${prefix}.effect must be "allow" or "deny".`)
		}

		if (!Array.isArray(rule.actions) || rule.actions.length === 0) {
			errors.push(`${prefix}.actions must contain at least one action.`)
		}

		if (!isPlainObject(rule.resource)) {
			errors.push(`${prefix}.resource is required.`)
			continue
		}

		if (!VALID_SCOPES.has(rule.resource.scope)) {
			errors.push(`${prefix}.resource.scope must be workspace, external, or any.`)
		}

		if (
			rule.resource.pathExact != null &&
			!String(rule.resource.pathExact).trim()
		) {
			errors.push(`${prefix}.resource.pathExact must not be empty.`)
		}

		if (
			rule.resource.pathPrefix != null &&
			!String(rule.resource.pathPrefix).trim()
		) {
			errors.push(`${prefix}.resource.pathPrefix must not be empty.`)
		}

		if (
			rule.resource.accessRootId != null &&
			rule.resource.accessRootId !== '*' &&
			!(
				Number.isInteger(rule.resource.accessRootId) &&
				rule.resource.accessRootId > 0
			)
		) {
			errors.push(`${prefix}.resource.accessRootId must be a positive integer or "*".`)
		}

		if (
			rule.requireApproval != null &&
			typeof rule.requireApproval !== 'boolean'
		) {
			errors.push(`${prefix}.requireApproval must be a boolean when present.`)
		}
	}

	return {
		ok: errors.length === 0,
		errors
	}
}
