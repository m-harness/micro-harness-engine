import dns from 'node:dns'
import { Buffer } from 'node:buffer'

const PRIVATE_RANGES_V4 = [
	{ prefix: '127.', label: 'loopback' },
	{ prefix: '10.', label: 'private (10.x)' },
	{ prefix: '0.', label: 'unspecified' },
	{ prefix: '169.254.', label: 'link-local' }
]

function isPrivateIPv4(ip) {
	for (const range of PRIVATE_RANGES_V4) {
		if (ip.startsWith(range.prefix)) return true
	}

	// 172.16.0.0/12
	if (ip.startsWith('172.')) {
		const second = Number.parseInt(ip.split('.')[1], 10)
		if (second >= 16 && second <= 31) return true
	}

	// 192.168.0.0/16
	if (ip.startsWith('192.168.')) return true

	return false
}

function isPrivateIPv6(ip) {
	const normalized = ip.toLowerCase()
	if (normalized === '::1') return true
	if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
	if (normalized.startsWith('fe80')) return true
	return false
}

export function isPrivateIP(ip) {
	return isPrivateIPv4(ip) || isPrivateIPv6(ip)
}

export async function validateUrl(urlString) {
	let parsed
	try {
		parsed = new URL(urlString)
	} catch {
		throw new Error('Invalid URL format.')
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('Only http and https protocols are allowed.')
	}

	const hostname = parsed.hostname

	// Check if hostname is already an IP literal
	if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
		if (isPrivateIP(hostname)) {
			throw new Error(`Request to private IP address ${hostname} is blocked (SSRF protection).`)
		}
		return parsed
	}

	// DNS lookup for SSRF prevention
	try {
		const { address } = await dns.promises.lookup(hostname)
		if (isPrivateIP(address)) {
			throw new Error(`Host "${hostname}" resolves to private IP ${address} (SSRF protection).`)
		}
	} catch (err) {
		if (err.message.includes('SSRF')) throw err
		throw new Error(`DNS resolution failed for "${hostname}": ${err.message}`)
	}

	return parsed
}

export function stripHtmlTags(html) {
	let text = html
	// Remove script and style blocks
	text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
	text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
	// Remove HTML tags
	text = text.replace(/<[^>]+>/g, ' ')
	// Decode common entities
	text = text.replace(/&amp;/g, '&')
	text = text.replace(/&lt;/g, '<')
	text = text.replace(/&gt;/g, '>')
	text = text.replace(/&quot;/g, '"')
	text = text.replace(/&#39;/g, "'")
	text = text.replace(/&nbsp;/g, ' ')
	// Collapse whitespace
	text = text.replace(/\s+/g, ' ').trim()
	return text
}

export function truncateBody(text, maxBytes = 100 * 1024) {
	const buf = Buffer.from(text, 'utf8')
	if (buf.length <= maxBytes) return text
	return buf.subarray(0, maxBytes).toString('utf8') + '\n... [truncated]'
}
