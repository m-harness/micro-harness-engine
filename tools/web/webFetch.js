import { validateUrl, stripHtmlTags, truncateBody } from './helpers.js'

export const webFetchTool = {
	name: 'web_fetch',
	description: 'Fetch content from a URL. Only supports http/https. Blocks requests to private/internal IPs.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			url: {
				type: 'string',
				description: 'The URL to fetch (http or https).'
			}
		},
		required: ['url']
	},
	async execute(input = {}, context = {}) {
		const urlString = String(input.url || '').trim()
		if (!urlString) {
			return { ok: false, error: 'url is required.' }
		}

		let parsed
		try {
			parsed = await validateUrl(urlString)
		} catch (err) {
			return { ok: false, error: err.message }
		}

		let response
		try {
			response = await fetch(parsed.href, {
				signal: AbortSignal.timeout(15_000),
				headers: {
					'User-Agent': 'microHarnessEngine-web-fetch/1.0',
					Accept: 'text/html, application/json, text/plain, */*'
				},
				redirect: 'follow'
			})
		} catch (err) {
			return { ok: false, error: `Fetch failed: ${err.message}` }
		}

		const contentType = String(response.headers.get('content-type') || '')
		const isText = contentType.startsWith('text/') || contentType.includes('application/json')

		if (!isText) {
			return {
				ok: false,
				error: `Unsupported content type: ${contentType}. Only text/* and application/json are supported.`
			}
		}

		let body
		try {
			body = await response.text()
		} catch (err) {
			return { ok: false, error: `Failed to read response body: ${err.message}` }
		}

		let content = truncateBody(body)

		if (contentType.includes('text/html')) {
			content = stripHtmlTags(content)
		}

		const byteLength = Buffer.byteLength(content, 'utf8')

		return {
			ok: true,
			url: parsed.href,
			statusCode: response.status,
			contentType,
			content,
			byteLength
		}
	}
}
