import dotenv from 'dotenv'
import {
	buildSyntheticCallId,
	createUserTextMessage,
	extractTextFromNormalizedBlocks,
	normalizeConversationMessages,
	serializeToolOutput
} from './common.js'

dotenv.config()

function getGeminiModel() {
	return process.env.GEMINI_MODEL || 'gemini-2.5-flash'
}

function buildHttpError(status, message) {
	const error = new Error(message)
	error.status = status
	return error
}

function toGeminiTools(toolDefinitions) {
	return [
		{
			functionDeclarations: toolDefinitions.map(tool => ({
				name: tool.name,
				description: tool.description,
				parameters: tool.input_schema
			}))
		}
	]
}

function toGeminiContents(messages) {
	return messages.map(message => {
		if (message.role === 'tool') {
			return {
				role: 'user',
				parts: message.content
					.filter(block => block.type === 'tool_result')
					.map(block => ({
						functionResponse: {
							name: block.name,
							response: {
								result: serializeToolOutput(block.output)
							}
						}
					}))
			}
		}

		return {
			role: message.role === 'assistant' ? 'model' : 'user',
			parts: message.content.map((block, index) => {
				if (block.type === 'text') {
					return {
						text: block.text
					}
				}

				if (block.type === 'tool_call') {
					return {
						functionCall: {
							id: block.callId || buildSyntheticCallId('gemini', block.name, block.input, index),
							name: block.name,
							args: block.input || {}
						}
					}
				}

				return {
					text: ''
				}
			})
		}
	})
}

function normalizeGeminiStopReason(reason, hasToolCalls) {
	if (hasToolCalls) return 'tool_calls'
	if (reason === 'MAX_TOKENS') return 'max_tokens'
	return 'end_turn'
}

function normalizeGeminiResponse(data) {
	const candidate = data?.candidates?.[0] || {}
	const parts = candidate?.content?.parts || []
	const normalizedContent = []
	const textParts = []
	let hasToolCalls = false

	for (const [index, part] of parts.entries()) {
		if (typeof part.text === 'string' && part.text.trim()) {
			textParts.push(part.text.trim())
			normalizedContent.push({
				type: 'text',
				text: part.text.trim()
			})
		}

		if (part.functionCall) {
			hasToolCalls = true
			normalizedContent.push({
				type: 'tool_call',
				callId: part.functionCall.id || buildSyntheticCallId('gemini', part.functionCall.name, part.functionCall.args, index),
				name: part.functionCall.name,
				input: part.functionCall.args || {}
			})
		}
	}

	return {
		assistantMessage: {
			role: 'assistant',
			content: normalizedContent
		},
		assistantText: textParts.join('\n').trim(),
		stopReason: normalizeGeminiStopReason(candidate?.finishReason, hasToolCalls)
	}
}

function wrapAsyncGenerator(genFn) {
	return function (...args) {
		const gen = genFn.apply(this, args)
		let finalResult = null
		return {
			[Symbol.asyncIterator]() { return this },
			async next() {
				const item = await gen.next()
				if (item.done) finalResult = item.value
				return item
			},
			async return(val) { return gen.return(val) },
			async throw(err) { return gen.throw(err) },
			get result() { return finalResult }
		}
	}
}

export const geminiProvider = {
	name: 'gemini',
	displayName: 'Gemini',
	apiLogName: 'gemini.generateContent',
	capabilities: {
		toolCalling: true,
		parallelToolCalls: false,
		streaming: true,
		structuredOutput: false,
		vision: false
	},
	getModel: getGeminiModel,
	normalizeMessages(messages) {
		return normalizeConversationMessages(messages, 'gemini')
	},
	createContinuationMessage({ stopReason }) {
		if (stopReason === 'max_tokens') {
			return createUserTextMessage('前回の応答の続きをお願いします。')
		}

		return null
	},
	generate: wrapAsyncGenerator(async function* ({ messages, systemPrompt, toolDefinitions, signal }) {
		const apiKey = process.env.GEMINI_API_KEY

		if (!apiKey) {
			throw new Error('GEMINI_API_KEY is required when LLM_PROVIDER=gemini.')
		}

		const baseUrl = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta'
		const response = await fetch(
			`${baseUrl}/models/${getGeminiModel()}:streamGenerateContent?key=${apiKey}&alt=sse`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					systemInstruction: {
						parts: [
							{
								text: systemPrompt
							}
						]
					},
					contents: toGeminiContents(messages),
					tools: toGeminiTools(toolDefinitions),
					toolConfig: toolDefinitions.length > 0
						? { functionCallingConfig: { mode: 'AUTO' } }
						: undefined
				}),
				signal
			}
		)

		if (!response.ok) {
			const data = await response.json().catch(() => ({}))
			throw buildHttpError(
				response.status,
				data?.error?.message || `Gemini request failed with status ${response.status}.`
			)
		}

		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ''
		const allParts = []
		let finishReason = null

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split('\n')
				buffer = lines.pop()

				for (const line of lines) {
					const trimmed = line.trim()
					if (!trimmed.startsWith('data: ')) continue
					let data
					try { data = JSON.parse(trimmed.slice(6)) } catch { continue }

					const candidate = data.candidates?.[0]
					if (!candidate) continue

					const parts = candidate.content?.parts || []
					for (const part of parts) {
						allParts.push(part)
						if (typeof part.text === 'string' && part.text) {
							yield { type: 'text_delta', text: part.text }
						}
					}

					if (candidate.finishReason) {
						finishReason = candidate.finishReason
					}
				}
			}
		} finally {
			reader.releaseLock()
		}

		return normalizeGeminiResponse({
			candidates: [{
				content: { parts: allParts },
				finishReason
			}]
		})
	})
}
