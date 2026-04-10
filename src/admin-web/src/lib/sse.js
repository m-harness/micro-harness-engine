/**
 * SSE client using fetch + ReadableStream.
 * Supports CSRF via cookie (credentials: 'include').
 */
export function createSSEConnection(url, { onEvent, onError, onClose }) {
	const abortController = new AbortController()
	let closed = false

	async function connect() {
		try {
			const response = await fetch(url, {
				credentials: 'include',
				signal: abortController.signal,
				headers: { Accept: 'text/event-stream' }
			})

			if (!response.ok) {
				onError?.(new Error(`SSE connection failed: ${response.status}`))
				return
			}

			const reader = response.body.getReader()
			const decoder = new TextDecoder()
			let buffer = ''

			while (!closed) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const parts = buffer.split('\n\n')
				buffer = parts.pop()

				for (const part of parts) {
					if (!part.trim()) continue

					let eventType = 'message'
					let data = ''

					for (const line of part.split('\n')) {
						if (line.startsWith('event: ')) {
							eventType = line.slice(7).trim()
						} else if (line.startsWith('data: ')) {
							data += line.slice(6)
						} else if (line.startsWith(':')) {
							// comment / heartbeat — ignore
						}
					}

					if (data) {
						try {
							onEvent?.({ type: eventType, data: JSON.parse(data) })
						} catch {
							onEvent?.({ type: eventType, data })
						}
					}
				}
			}
		} catch (err) {
			if (err?.name === 'AbortError') return
			onError?.(err)
		} finally {
			if (!closed) onClose?.()
		}
	}

	connect()

	return {
		close() {
			closed = true
			abortController.abort()
		}
	}
}
