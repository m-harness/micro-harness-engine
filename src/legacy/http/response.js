const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i

export class HttpError extends Error {
	constructor(statusCode, message, details = null) {
		super(message)
		this.name = 'HttpError'
		this.statusCode = statusCode
		this.details = details
	}
}

export function applyCorsHeaders(req, res) {
	const origin = req.headers.origin

	if (origin && LOCAL_ORIGIN_PATTERN.test(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin)
		res.setHeader('Vary', 'Origin')
	}

	res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
	res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
}

export function sendJson(res, statusCode, payload) {
	res.writeHead(statusCode, {
		'Content-Type': 'application/json; charset=utf-8'
	})
	res.end(JSON.stringify(payload))
}

export async function readJsonBody(req) {
	const chunks = []

	for await (const chunk of req) {
		chunks.push(Buffer.from(chunk))
	}

	if (chunks.length === 0) {
		return {}
	}

	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'))
	} catch {
		throw new HttpError(400, 'Request body must be valid JSON.')
	}
}

export function requireString(value, fieldName) {
	if (typeof value !== 'string' || !value.trim()) {
		throw new HttpError(400, `${fieldName} is required.`)
	}

	return value.trim()
}

export function requireInteger(value, fieldName) {
	const parsed = Number.parseInt(String(value), 10)
	if (!Number.isInteger(parsed)) {
		throw new HttpError(400, `${fieldName} must be an integer.`)
	}

	return parsed
}

export function mapErrorToResponse(error) {
	if (error instanceof HttpError) {
		return {
			statusCode: error.statusCode,
			body: {
				ok: false,
				error: error.message,
				details: error.details ?? undefined
			}
		}
	}

	const message = String(error?.message || 'Unexpected error.')

	if (/unknown /i.test(message) || /does not exist/i.test(message)) {
		return {
			statusCode: 404,
			body: {
				ok: false,
				error: message
			}
		}
	}

	if (/already exists|required|must be|cannot be deleted|different replacement|outside the allowed/i.test(message)) {
		return {
			statusCode: 400,
			body: {
				ok: false,
				error: message
			}
		}
	}

	if (/admin privileges are required/i.test(message)) {
		return {
			statusCode: 403,
			body: {
				ok: false,
				error: message
			}
		}
	}

	if (/last active admin/i.test(message)) {
		return {
			statusCode: 409,
			body: {
				ok: false,
				error: message
			}
		}
	}

	return {
		statusCode: 500,
		body: {
			ok: false,
			error: message
		}
	}
}
