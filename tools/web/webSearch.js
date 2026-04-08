import { appConfig } from '../../src/core/config.js'

export const webSearchTool = {
	name: 'web_search',
	description: 'Search the web using Brave Search API. Requires BRAVE_SEARCH_API_KEY environment variable.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: 'Search query string.'
			},
			count: {
				type: 'integer',
				description: 'Number of results to return (1-20, default: 5).',
				default: 5
			}
		},
		required: ['query']
	},
	async execute(input = {}, context = {}) {
		const query = String(input.query || '').trim()
		if (!query) {
			return { ok: false, error: 'query is required.' }
		}

		const apiKey = appConfig.braveSearchApiKey
		if (!apiKey) {
			return {
				ok: false,
				error: 'BRAVE_SEARCH_API_KEY environment variable is not set. Web search is unavailable.'
			}
		}

		const count = Math.max(1, Math.min(Number(input.count) || 5, 20))

		const url = new URL('https://api.search.brave.com/res/v1/web/search')
		url.searchParams.set('q', query)
		url.searchParams.set('count', String(count))

		let response
		try {
			response = await fetch(url.href, {
				signal: AbortSignal.timeout(10_000),
				headers: {
					Accept: 'application/json',
					'Accept-Encoding': 'gzip',
					'X-Subscription-Token': apiKey
				}
			})
		} catch (err) {
			return { ok: false, error: `Search request failed: ${err.message}` }
		}

		if (!response.ok) {
			return { ok: false, error: `Brave Search API returned status ${response.status}.` }
		}

		let data
		try {
			data = await response.json()
		} catch (err) {
			return { ok: false, error: `Failed to parse search response: ${err.message}` }
		}

		const webResults = data.web?.results || []
		const results = webResults.map(item => ({
			title: item.title || '',
			url: item.url || '',
			description: item.description || ''
		}))

		return {
			ok: true,
			query,
			results
		}
	}
}
