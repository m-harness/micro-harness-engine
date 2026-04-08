const SECRET_PATTERNS = [
	{
		label: 'anthropic_key',
		pattern: /\bsk-ant-[A-Za-z0-9_-]{10,}\b/g
	},
	{
		label: 'openai_key',
		pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{10,}\b/g
	},
	{
		label: 'github_token',
		pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g
	},
	{
		label: 'bearer_token',
		pattern: /\bBearer\s+[A-Za-z0-9._\-+/=]{12,}\b/g
	},
	{
		label: 'pem_private_key',
		pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
	},
	{
		label: 'assignment_secret',
		pattern: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|client[_-]?secret|password)\s*[:=]\s*["']?[^\s"']{6,}["']?/gi
	}
]

function redactStringValue(text) {
	let redacted = text

	for (const rule of SECRET_PATTERNS) {
		redacted = redacted.replace(rule.pattern, `[REDACTED:${rule.label}]`)
	}

	return redacted
}

export function redactSensitiveText(text) {
	if (typeof text !== 'string') {
		return text
	}

	return redactStringValue(text)
}

export function redactSensitiveValue(value) {
	if (typeof value === 'string') {
		return redactSensitiveText(value)
	}

	if (Array.isArray(value)) {
		return value.map(entry => redactSensitiveValue(entry))
	}

	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				redactSensitiveValue(entry)
			])
		)
	}

	return value
}

export function hasSensitiveContent(text) {
	if (typeof text !== 'string') {
		return false
	}

	return redactSensitiveText(text) !== text
}
