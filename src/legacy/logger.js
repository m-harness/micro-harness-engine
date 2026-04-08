import { redactSensitiveText } from '../protection/classifier.js'

function trimText(text, max = 120) {
	if (text == null) return ''
	const rawText = typeof text === 'string'
		? text
		: JSON.stringify(text)
	const singleLine = redactSensitiveText(rawText).replace(/\s+/g, ' ').trim()
	if (singleLine.length <= max) return singleLine
	return `${singleLine.slice(0, max)}...`
}

function summarizeMessagesForLog(messages) {
	if (!messages || messages.length === 0) {
		return 'メッセージなし'
	}

	if (messages.length === 1) {
		return `最新メッセージ: ${trimText(messages[0].content)}`
	}

	const latest = messages[messages.length - 1]
	return `過去メッセージ ${messages.length - 1}件 / 最新メッセージ: ${trimText(latest.content)}`
}

export function printLog({ sender, eventType, content }) {
	console.log(`[${sender}] [${eventType}] ${content}`)
}

export function logUserMessage(content) {
	printLog({
		sender: 'user',
		eventType: 'user_message',
		content: trimText(content)
	})
}

export function logAssistantMessage(content) {
	printLog({
		sender: 'assistant',
		eventType: 'assistant_message',
		content: trimText(content)
	})
}

export function logApiRequest(messages, eventType = 'llm_request') {
	printLog({
		sender: 'system',
		eventType,
		content: summarizeMessagesForLog(messages)
	})
}

export function logApiResponse(responseText, eventType = 'llm_response') {
	printLog({
		sender: 'system',
		eventType,
		content: trimText(responseText)
	})
}

export function logSessionChanged(sessionToken) {
	printLog({
		sender: 'system',
		eventType: 'session_rotated',
		content: `新しいセッション: ${sessionToken}`
	})
}

export function logSessionStart(sessionToken) {
	printLog({
		sender: 'system',
		eventType: 'session_active',
		content: `現在のセッション: ${sessionToken}`
	})
}

export function logError(error) {
	printLog({
		sender: 'system',
		eventType: 'error',
		content: trimText(error?.stack || error?.message || String(error), 200)
	})
}

export function logToolUse(toolName, input) {
	printLog({
		sender: 'assistant',
		eventType: 'tool_use',
		content: `${toolName} ${trimText(JSON.stringify(input), 160)}`
	})
}

export function logToolResult(toolName, result) {
	printLog({
		sender: 'tool',
		eventType: 'tool_result',
		content: `${toolName} ${trimText(JSON.stringify(result), 160)}`
	})
}
