import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'
import {
	buildSyntheticCallId,
	createUserTextMessage,
	extractTextFromNormalizedBlocks,
	normalizeConversationMessages,
	serializeToolOutput
} from './common.js'

dotenv.config()

let client = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY
})

function getAnthropicModel() {
	return process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'
}

function toAnthropicMessages(messages) {
	return messages.map(message => {
		if (message.role === 'tool') {
			return {
				role: 'user',
				content: message.content
					.filter(block => block.type === 'tool_result')
					.map(block => ({
						type: 'tool_result',
						tool_use_id: block.callId,
						content: serializeToolOutput(block.output)
					}))
			}
		}

		return {
			role: message.role,
			content: message.content.map((block, index) => {
				if (block.type === 'text') {
					return {
						type: 'text',
						text: block.text
					}
				}

				if (block.type === 'tool_call') {
					return {
						type: 'tool_use',
						id: block.callId || buildSyntheticCallId('anthropic', block.name, block.input, index),
						name: block.name,
						input: block.input || {}
					}
				}

				return {
					type: 'text',
					text: ''
				}
			})
		}
	})
}

function normalizeAnthropicResponse(response) {
	const content = (response?.content || []).map((block, index) => {
		if (block.type === 'text') {
			return {
				type: 'text',
				text: block.text || ''
			}
		}

		if (block.type === 'tool_use') {
			return {
				type: 'tool_call',
				callId: block.id || buildSyntheticCallId('anthropic', block.name, block.input, index),
				name: block.name,
				input: block.input || {}
			}
		}

		return null
	}).filter(Boolean)

	return {
		assistantMessage: {
			role: 'assistant',
			content
		},
		assistantText: extractTextFromNormalizedBlocks(content),
		stopReason: response?.stop_reason || 'end_turn'
	}
}

export const anthropicProvider = {
	name: 'anthropic',
	displayName: 'Claude',
	apiLogName: 'anthropic.messages.create',
	capabilities: {
		toolCalling: true,
		parallelToolCalls: true,
		streaming: false,
		structuredOutput: false,
		vision: false
	},
	getModel: getAnthropicModel,
	normalizeMessages(messages) {
		return normalizeConversationMessages(messages, 'anthropic')
	},
	createContinuationMessage({ stopReason }) {
		if (stopReason === 'max_tokens') {
			return createUserTextMessage('前回の応答の続きをお願いします。')
		}

		return null
	},
	async generate({ messages, systemPrompt, toolDefinitions, maxTokens }) {
		const response = await client.messages.create({
			model: getAnthropicModel(),
			max_tokens: maxTokens,
			system: [
				{
					type: 'text',
					text: systemPrompt
				}
			],
			tools: toolDefinitions,
			tool_choice: {
				type: 'auto',
				disable_parallel_tool_use: true
			},
			messages: toAnthropicMessages(messages)
		})

		return normalizeAnthropicResponse(response)
	},
	setClientForTesting(nextClient) {
		client = nextClient
	},
	resetClientForTesting() {
		client = new Anthropic({
			apiKey: process.env.ANTHROPIC_API_KEY
		})
	}
}
