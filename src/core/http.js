import { isOriginAllowed, appConfig } from './config.js'

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
	if (origin && isOriginAllowed(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin)
		res.setHeader('Vary', 'Origin')
		res.setHeader('Access-Control-Allow-Credentials', 'true')
	}

	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token')
	res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
}

export function applySecurityHeaders(res, { isSpa = false } = {}) {
	res.setHeader('X-Content-Type-Options', 'nosniff')
	res.setHeader('X-Frame-Options', 'DENY')
	res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

	if (isSpa) {
		res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'")
	} else {
		res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
	}

	if (process.env.NODE_ENV === 'production') {
		res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
	}
}

export function sendJson(res, statusCode, payload, extraHeaders = {}) {
	res.writeHead(statusCode, {
		'Content-Type': 'application/json; charset=utf-8',
		...extraHeaders
	})
	res.end(JSON.stringify(payload))
}

export async function readRawBody(req) {
	const maxBytes = appConfig.maxBodyBytes

	const contentLength = req.headers['content-length']
	if (contentLength != null) {
		const declared = Number.parseInt(contentLength, 10)
		if (Number.isFinite(declared) && declared > maxBytes) {
			req.destroy()
			throw new HttpError(413, `Request body exceeds the ${maxBytes} byte limit.`)
		}
	}

	const chunks = []
	let totalBytes = 0
	for await (const chunk of req) {
		const buf = Buffer.from(chunk)
		totalBytes += buf.length
		if (totalBytes > maxBytes) {
			req.destroy()
			throw new HttpError(413, `Request body exceeds the ${maxBytes} byte limit.`)
		}
		chunks.push(buf)
	}
	return Buffer.concat(chunks).toString('utf8')
}

export async function readJsonBody(req) {
	const rawBody = await readRawBody(req)
	if (!rawBody) {
		return {}
	}

	try {
		return JSON.parse(rawBody)
	} catch {
		throw new HttpError(400, 'Request body must be valid JSON.')
	}
}

export function requireString(value, fieldName, { maxLength = 10_000 } = {}) {
	if (typeof value !== 'string' || !value.trim()) {
		throw new HttpError(400, `${fieldName} is required.`)
	}
	const trimmed = value.trim()
	if (trimmed.length > maxLength) {
		throw new HttpError(400, `${fieldName} must be at most ${maxLength} characters.`)
	}
	return trimmed
}

export function requireOptionalString(value, { maxLength = 10_000 } = {}) {
	if (value == null || value === '') {
		return null
	}
	const trimmed = String(value).trim()
	if (trimmed.length > maxLength) {
		throw new HttpError(400, `Value must be at most ${maxLength} characters.`)
	}
	return trimmed
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

	console.error('[Internal Error]', error)
	return {
		statusCode: 500,
		body: {
			ok: false,
			error: 'An internal error occurred.'
		}
	}
}
