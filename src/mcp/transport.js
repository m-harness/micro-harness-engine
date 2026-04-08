/**
 * Transport layer for MCP: StdioTransport (child process) and HttpTransport (Streamable HTTP + SSE).
 */

import { spawn } from 'node:child_process'
import { NdjsonBuffer } from './protocol.js'

const activeProcesses = new Set()

process.on('exit', () => {
	for (const child of activeProcesses) {
		try {
			child.kill('SIGKILL')
		} catch {}
	}
	activeProcesses.clear()
})

const MAX_STDERR_LINES = 50

export class StdioTransport {
	constructor({ command, args = [], env = {} }) {
		this._command = command
		this._args = args
		this._env = { ...process.env, ...env }
		this._process = null
		this._buffer = new NdjsonBuffer()
		this._onMessage = null
		this._stderrLines = []
	}

	start(onMessage) {
		this._onMessage = onMessage
		this._process = spawn(this._command, this._args, {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: this._env,
			shell: process.platform === 'win32',
			windowsHide: true
		})

		activeProcesses.add(this._process)

		this._process.stdout.setEncoding('utf8')
		this._process.stdout.on('data', chunk => {
			const messages = this._buffer.append(chunk)
			for (const msg of messages) {
				this._onMessage?.(msg)
			}
		})

		this._process.stderr.setEncoding('utf8')
		this._process.stderr.on('data', chunk => {
			const lines = chunk.split('\n').filter(Boolean)
			this._stderrLines.push(...lines)
			if (this._stderrLines.length > MAX_STDERR_LINES) {
				this._stderrLines = this._stderrLines.slice(-MAX_STDERR_LINES)
			}
		})

		this._process.on('exit', (code, signal) => {
			activeProcesses.delete(this._process)
			this._process = null
		})

		this._process.on('error', error => {
			console.error(`[mcp/transport] Process error (${this._command}):`, error.message)
			activeProcesses.delete(this._process)
			this._process = null
		})
	}

	send(data) {
		if (!this._process?.stdin?.writable) {
			throw new Error('Transport not connected')
		}
		this._process.stdin.write(data)
	}

	async stop() {
		const child = this._process
		if (!child) {
			return
		}

		return new Promise(resolve => {
			const forceKillTimer = setTimeout(() => {
				try {
					child.kill('SIGKILL')
				} catch {}
				resolve()
			}, 5000)

			child.on('exit', () => {
				clearTimeout(forceKillTimer)
				activeProcesses.delete(child)
				resolve()
			})

			try {
				child.kill('SIGTERM')
			} catch {
				clearTimeout(forceKillTimer)
				activeProcesses.delete(child)
				resolve()
			}
		})
	}

	get stderrLines() {
		return this._stderrLines
	}

	get connected() {
		return this._process !== null && !this._process.killed
	}
}

export class HttpTransport {
	constructor({ url, headers = {} }) {
		this._url = url
		this._headers = headers
		this._onMessage = null
		this._abortController = null
		this._sessionId = null
	}

	start(onMessage) {
		this._onMessage = onMessage
		this._abortController = new AbortController()
		// SSE GET は初回POSTの後に試行する（セッションID取得後）
	}

	async _startSse() {
		if (!this._sessionId) {
			return
		}
		try {
			const response = await fetch(this._url, {
				method: 'GET',
				headers: {
					...this._headers,
					'Accept': 'text/event-stream',
					'Mcp-Session-Id': this._sessionId
				},
				signal: this._abortController?.signal
			})

			if (!response.ok || !response.body) {
				// SSE GETはオプション — 非対応サーバーではスキップ
				return
			}

			this._readSseStream(response.body)
		} catch (error) {
			if (error.name !== 'AbortError') {
				// SSEは任意機能なのでwarnレベル
				console.warn(`[mcp/transport] SSE GET not available: ${error.message}`)
			}
		}
	}

	async _readSseStream(body) {
		const reader = body.getReader()
		const decoder = new TextDecoder()
		let sseBuffer = ''

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				sseBuffer += decoder.decode(value, { stream: true })
				const events = sseBuffer.split('\n\n')
				sseBuffer = events.pop() || ''

				for (const event of events) {
					this._parseSseEvent(event)
				}
			}
			if (sseBuffer.trim()) {
				this._parseSseEvent(sseBuffer)
			}
		} catch (error) {
			if (error.name !== 'AbortError') {
				console.warn('[mcp/transport] SSE stream ended:', error.message)
			}
		}
	}

	_parseSseEvent(event) {
		const lines = event.split('\n')
		for (const line of lines) {
			if (line.startsWith('data: ')) {
				try {
					const parsed = JSON.parse(line.slice(6))
					this._onMessage?.(parsed)
				} catch {
					// data行がJSONでない場合はスキップ
				}
			}
		}
	}

	async send(data) {
		const body = typeof data === 'string' ? data.trim() : JSON.stringify(data)

		const response = await fetch(this._url, {
			method: 'POST',
			headers: {
				...this._headers,
				'Content-Type': 'application/json',
				'Accept': 'application/json, text/event-stream',
				...(this._sessionId ? { 'Mcp-Session-Id': this._sessionId } : {})
			},
			body,
			signal: this._abortController?.signal
		})

		if (!response.ok) {
			const text = await response.text().catch(() => '')
			throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
		}

		// セッションIDを保存（initializeレスポンスで返る）
		const sessionId = response.headers.get('mcp-session-id')
		if (sessionId) {
			this._sessionId = sessionId
			// セッション取得後にSSE接続を試行
			this._startSse()
		}

		// 202 Accepted (通知応答) はボディなし
		if (response.status === 202) {
			return
		}

		const contentType = response.headers.get('content-type') || ''

		if (contentType.includes('text/event-stream')) {
			// Streamable HTTP: POSTレスポンスがSSEの場合
			await this._readPostSseResponse(response)
		} else if (contentType.includes('application/json')) {
			const text = await response.text()
			if (text) {
				this._onMessage?.(JSON.parse(text))
			}
		}
	}

	async _readPostSseResponse(response) {
		if (!response.body) return

		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		let sseBuffer = ''

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				sseBuffer += decoder.decode(value, { stream: true })
				const events = sseBuffer.split('\n\n')
				sseBuffer = events.pop() || ''

				for (const event of events) {
					this._parseSseEvent(event)
				}
			}
			// ストリーム終了時にバッファに残ったデータも処理
			if (sseBuffer.trim()) {
				this._parseSseEvent(sseBuffer)
			}
		} catch (error) {
			if (error.name !== 'AbortError') {
				console.error('[mcp/transport] POST SSE read error:', error.message)
			}
		}
	}

	async stop() {
		this._abortController?.abort()
		this._abortController = null
		this._sessionId = null
	}

	get connected() {
		return this._abortController !== null
	}
}
