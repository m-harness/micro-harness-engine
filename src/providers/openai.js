import dotenv from 'dotenv'
import {
	buildSyntheticCallId,
	createUserTextMessage,
	extractTextFromNormalizedBlocks,
	normalizeConversationMessages,
	parseJsonObject,
	serializeToolOutput
} from './common.js'

dotenv.config()

function getOpenAiModel() {
	return process.env.OPENAI_MODEL || 'gpt-4.1-mini'
}

function buildHttpError(status, message) {
	const error = new Error(message)
	error.status = status
	return error
}

function toOpenAiTools(toolDefinitions) {
	return toolDefinitions.map(tool => ({
		type: 'function',
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.input_schema
		}
	}))
}

function flattenOpenAiMessages(messages, systemPrompt) {
	const openAiMessages = [
		{
			role: 'system',
			content: systemPrompt
		}
	]

	for (const message of messages) {
		if (message.role === 'tool') {
			for (const block of message.content.filter(entry => entry.type === 'tool_result')) {
				openAiMessages.push({
					role: 'tool',
					tool_call_id: block.callId,
					content: serializeToolOutput(block.output)
				})
			}

			continue
		}

		const textContent = extractTextFromNormalizedBlocks(message.content)
		const toolCalls = message.role === 'assistant'
			? message.content
				.filter(block => block.type === 'tool_call')
				.map((block, index) => ({
					id: block.callId || buildSyntheticCallId('openai', block.name, block.input, index),
					type: 'function',
					function: {
						name: block.name,
						arguments: JSON.stringify(block.input || {})
					}
				}))
			: []

		openAiMessages.push({
			role: message.role,
			content: textContent || (toolCalls.length > 0 ? null : ''),
			tool_calls: toolCalls.length > 0 ? toolCalls : undefined
		})
	}

	return openAiMessages
}

function normalizeFinishReason(reason) {
	if (reason === 'tool_calls') return 'tool_calls'
	if (reason === 'length') return 'max_tokens'
	return 'end_turn'
}

function normalizeOpenAiResponse(data) {
	const choice = data?.choices?.[0]
	const message = choice?.message || {}
	const assistantText = typeof message.content === 'string'
		? message.content.trim()
		: Array.isArray(message.content)
			? message.content
				.filter(part => part.type === 'text')
				.map(part => part.text)
				.join('\n')
				.trim()
			: ''

	const normalizedContent = []

	if (assistantText) {
		normalizedContent.push({
			type: 'text',
			text: assistantText
		})
	}

	for (const [index, toolCall] of (message.tool_calls || []).entries()) {
		normalizedContent.push({
			type: 'tool_call',
			callId: toolCall.id || buildSyntheticCallId('openai', toolCall?.function?.name, toolCall?.function?.arguments, index),
			name: toolCall?.function?.name,
			input: parseJsonObject(toolCall?.function?.arguments, {})
		})
	}

	return {
		assistantMessage: {
			role: 'assistant',
			content: normalizedContent
		},
		assistantText,
		stopReason: normalizeFinishReason(choice?.finish_reason)
	}
}

export const openAiProvider = {
	name: 'openai',
	displayName: 'OpenAI',
	apiLogName: 'openai.chat.completions.create',
	capabilities: {
		toolCalling: true,
		parallelToolCalls: true,
		streaming: false,
		structuredOutput: false,
		vision: false
	},
	getModel: getOpenAiModel,
	normalizeMessages(messages) {
		return normalizeConversationMessages(messages, 'openai')
	},
	createContinuationMessage({ stopReason }) {
		if (stopReason === 'max_tokens') {
			return createUserTextMessage('前回の応答の続きをお願いします。')
		}

		return null
	},
	async generate({ messages, systemPrompt, toolDefinitions, maxTokens }) {
		const apiKey = process.env.OPENAI_API_KEY

		if (!apiKey) {
			throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai.')
		}

		const response = await fetch(
			process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`
				},
				body: JSON.stringify({
					model: getOpenAiModel(),
					messages: flattenOpenAiMessages(messages, systemPrompt),
					tools: toOpenAiTools(toolDefinitions),
					tool_choice: 'auto',
					parallel_tool_calls: false,
					max_tokens: maxTokens
				})
			}
		)

		const data = await response.json().catch(() => ({}))

		if (!response.ok) {
			throw buildHttpError(
				response.status,
				data?.error?.message || `OpenAI request failed with status ${response.status}.`
			)
		}

		return normalizeOpenAiResponse(data)
	}
}
