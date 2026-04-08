import crypto from 'node:crypto'

const TOKEN_BYTES = 32

export function nowIso() {
	return new Date().toISOString()
}

export function addHours(date, hours) {
	return new Date(date.getTime() + (hours * 60 * 60 * 1000))
}

export function addMinutes(date, minutes) {
	return new Date(date.getTime() + (minutes * 60 * 1000))
}

export function createId() {
	return crypto.randomUUID()
}

export function createOpaqueToken() {
	return crypto.randomBytes(TOKEN_BYTES).toString('base64url')
}

export function sha256(value) {
	return crypto.createHash('sha256').update(String(value)).digest('hex')
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
	const derived = crypto.scryptSync(password, salt, 64).toString('hex')
	return {
		salt,
		hash: derived
	}
}

export function verifyPassword(password, salt, expectedHash) {
	const derived = crypto.scryptSync(password, salt, 64)
	const expected = Buffer.from(expectedHash, 'hex')
	if (derived.length !== expected.length) {
		return false
	}

	return crypto.timingSafeEqual(derived, expected)
}

export function serializeCookie(name, value, options = {}) {
	const segments = [`${name}=${encodeURIComponent(value)}`]

	if (options.maxAge != null) {
		segments.push(`Max-Age=${options.maxAge}`)
	}

	segments.push(`Path=${options.path || '/'}`)

	if (options.httpOnly !== false) {
		segments.push('HttpOnly')
	}

	if (options.sameSite) {
		segments.push(`SameSite=${options.sameSite}`)
	} else {
		segments.push('SameSite=Lax')
	}

	if (options.secure !== false) {
		if (options.secure === true || process.env.NODE_ENV === 'production') {
			segments.push('Secure')
		}
	}

	return segments.join('; ')
}

export function parseCookies(cookieHeader = '') {
	return String(cookieHeader)
		.split(';')
		.map(entry => entry.trim())
		.filter(Boolean)
		.reduce((accumulator, part) => {
			const separatorIndex = part.indexOf('=')
			if (separatorIndex <= 0) {
				return accumulator
			}

			const key = part.slice(0, separatorIndex).trim()
			const value = decodeURIComponent(part.slice(separatorIndex + 1).trim())
			accumulator[key] = value
			return accumulator
		}, {})
}

export function timingSafeStringEqual(a, b) {
	const aBuf = Buffer.from(String(a))
	const bBuf = Buffer.from(String(b))
	if (aBuf.length !== bBuf.length) {
		const dummy = Buffer.alloc(aBuf.length)
		crypto.timingSafeEqual(aBuf, dummy)
		return false
	}
	return crypto.timingSafeEqual(aBuf, bBuf)
}

export function verifySlackSignature({
	signingSecret,
	timestamp,
	rawBody,
	signature,
	now = Date.now()
}) {
	if (!signingSecret || !timestamp || !signature) {
		return false
	}

	const ageSeconds = Math.abs(Math.floor(now / 1000) - Number(timestamp))
	if (!Number.isFinite(ageSeconds) || ageSeconds > 60 * 5) {
		return false
	}

	const base = `v0:${timestamp}:${rawBody}`
	const digest = `v0=${crypto.createHmac('sha256', signingSecret).update(base).digest('hex')}`
	const left = Buffer.from(digest)
	const right = Buffer.from(String(signature))

	if (left.length !== right.length) {
		return false
	}

	return crypto.timingSafeEqual(left, right)
}

export function verifyDiscordSignature({
	publicKey,
	timestamp,
	rawBody,
	signature
}) {
	if (!publicKey || !timestamp || !rawBody || !signature) {
		return false
	}

	try {
		const derPrefix = Buffer.from('302a300506032b6570032100', 'hex')
		const key = Buffer.concat([derPrefix, Buffer.from(publicKey, 'hex')])
		return crypto.verify(
			null,
			Buffer.from(`${timestamp}${rawBody}`),
			{
				key,
				format: 'der',
				type: 'spki'
			},
			Buffer.from(signature, 'hex')
		)
	} catch {
		return false
	}
}
