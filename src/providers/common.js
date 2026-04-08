import crypto from 'node:crypto'

function stableSerializeInternal(value) {
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value)
	}

	if (Array.isArray(value)) {
		return `[${value.map(item => stableSerializeInternal(item)).join(',')}]`
	}

	const keys = Object.keys(value).sort()
	const entries = keys.map(key => `${JSON.stringify(key)}:${stableSerializeInternal(value[key])}`)
	return `{${entries.join(',')}}`
}

export function stableSerialize(value) {
	return stableSerializeInternal(value)
}

export function buildSyntheticCallId(providerName, name, input, index = 0) {
	const hash = crypto
		.createHash('sha1')
		.update(`${providerName}:${name}:${index}:${stableSerialize(input ?? {})}`)
		.digest('hex')
		.slice(0, 12)

	return `${providerName}-${name}-${index}-${hash}`
}

export function parseJsonObject(text, fallback = {}) {
	if (typeof text !== 'string' || !text.trim()) {
		return fallback
	}

	try {
		const parsed = JSON.parse(text)
		return parsed && typeof parsed === 'object' ? parsed : fallback
	} catch {
		return fallback
	}
}

export function parseMaybeJson(value) {
	if (typeof value !== 'string') {
		return value
	}

	try {
		return JSON.parse(value)
	} catch {
		return value
	}
}

export function serializeToolOutput(output) {
	return typeof output === 'string'
		? output
		: JSON.stringify(output, null, '\t')
}

function normalizeBlock(block, providerHint = 'generic', index = 0) {
	if (!block) {
		return null
	}

	if (block.type === 'text') {
		return {
			type: 'text',
			text: block.text ?? block.content ?? ''
		}
	}

	if (block.type === 'tool_call') {
		return {
			type: 'tool_call',
			callId: block.callId || block.id || buildSyntheticCallId(providerHint, block.name, block.input, index),
			name: block.name,
			input: block.input || {}
		}
	}

	if (block.type === 'tool_use') {
		return {
			type: 'tool_call',
			callId: block.id || buildSyntheticCallId(providerHint, block.name, block.input, index),
			name: block.name,
			input: block.input || {}
		}
	}

	if (block.type === 'tool_result') {
		return {
			type: 'tool_result',
			callId: block.callId || block.tool_use_id || buildSyntheticCallId(providerHint, block.name || 'tool_result', block.output ?? block.content, index),
			name: block.name || null,
			output: block.output ?? parseMaybeJson(block.content)
		}
	}

	return null
}

export function normalizeConversationMessages(messages = [], providerHint = 'generic') {
	return messages
		.map((message, messageIndex) => {
			if (!message) {
				return null
			}

			const rawContent = Array.isArray(message.content)
				? message.content
				: [{
					type: 'text',
					text: message.content ?? ''
				}]

			const normalizedContent = rawContent
				.map((block, blockIndex) => normalizeBlock(block, providerHint, (messageIndex * 10) + blockIndex))
				.filter(Boolean)

			const allToolResults = normalizedContent.length > 0 &&
				normalizedContent.every(block => block.type === 'tool_result')
			const role = allToolResults && message.role === 'user'
				? 'tool'
				: message.role

			return {
				role,
				content: normalizedContent
			}
		})
		.filter(Boolean)
}

export function extractTextFromNormalizedBlocks(blocks = []) {
	return blocks
		.filter(block => block.type === 'text')
		.map(block => block.text)
		.join('\n')
		.trim()
}

export function hasNormalizedToolCalls(blocks = []) {
	return blocks.some(block => block.type === 'tool_call')
}

export function createUserTextMessage(text) {
	return {
		role: 'user',
		content: [
			{
				type: 'text',
				text
			}
		]
	}
}
