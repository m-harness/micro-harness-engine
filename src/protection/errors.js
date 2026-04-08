export class ProtectionError extends Error {
	constructor(message, details = {}) {
		super(message)
		this.name = 'ProtectionError'
		this.code = 'PROTECTED_PATH'
		this.action = details.action || null
		this.targetPath = details.targetPath || null
		this.effect = details.effect || 'deny'
		this.userActionRequired = details.userActionRequired !== false
		this.rule = details.rule || null
	}
}

export function isProtectionError(error) {
	return error instanceof ProtectionError
}
