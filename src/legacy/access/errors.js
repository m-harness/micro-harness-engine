export class AccessError extends Error {
	constructor(message, details = {}) {
		super(message)
		this.name = 'AccessError'
		this.code = 'ACCESS_DENIED'
		this.action = details.action || null
		this.targetPath = details.targetPath || null
		this.reason = details.reason || 'access_denied'
		this.scope = details.scope || null
		this.userActionRequired = details.userActionRequired !== false
	}
}

export function isAccessError(error) {
	return error instanceof AccessError
}
