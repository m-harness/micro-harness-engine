/**
 * JSON-RPC 2.0 message builders and NDJSON buffer parser for MCP protocol.
 */

export function buildRequest(id, method, params) {
	const message = { jsonrpc: '2.0', id, method }
	if (params !== undefined) {
		message.params = params
	}
	return JSON.stringify(message) + '\n'
}

export function buildNotification(method, params) {
	const message = { jsonrpc: '2.0', method }
	if (params !== undefined) {
		message.params = params
	}
	return JSON.stringify(message) + '\n'
}

export class NdjsonBuffer {
	constructor() {
		this._buffer = ''
	}

	append(chunk) {
		this._buffer += chunk
		const results = []
		let newlineIndex

		while ((newlineIndex = this._buffer.indexOf('\n')) !== -1) {
			const line = this._buffer.slice(0, newlineIndex).trim()
			this._buffer = this._buffer.slice(newlineIndex + 1)

			if (!line) {
				continue
			}

			try {
				results.push(JSON.parse(line))
			} catch {
				console.error('[mcp/protocol] Failed to parse NDJSON line:', line.slice(0, 200))
			}
		}

		return results
	}
}
