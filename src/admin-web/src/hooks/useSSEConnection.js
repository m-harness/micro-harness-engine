import { useAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { createSSEConnection } from '../lib/sse.js'
import { authStateAtom } from '../stores/auth.js'
import { selectedConversationIdAtom, streamingMessageAtom } from '../stores/workspace.js'
import { useWorkspace } from './useWorkspace.js'

const FALLBACK_REFRESH_MS = 4000

/**
 * Manages a single SSE connection for real-time streaming.
 * Must be called from exactly ONE component (e.g. WorkspaceLayout)
 * to avoid duplicate connections.
 */
export function useSSEConnection() {
	const [authState] = useAtom(authStateAtom)
	const [selectedConversationId] = useAtom(selectedConversationIdAtom)
	const [, setStreamingMessage] = useAtom(streamingMessageAtom)
	const [useSSE, setUseSSE] = useState(true)
	const { loadWorkspace } = useWorkspace()

	const isLoggedIn = !!authState.user
	const selectedIdRef = useRef(selectedConversationId)
	selectedIdRef.current = selectedConversationId

	// SSE connection for real-time streaming
	useEffect(() => {
		if (!isLoggedIn || !selectedConversationId || !useSSE) return

		const sse = createSSEConnection(
			`/api/conversations/${encodeURIComponent(selectedConversationId)}/stream`,
			{
				onEvent: (event) => {
					switch (event.type) {
						case 'run.started':
							setStreamingMessage({ text: '', runId: event.data?.runId })
							break
						case 'delta':
							if (event.data?.type === 'text_delta' && event.data?.text) {
								setStreamingMessage(prev => ({
									text: (prev?.text || '') + event.data.text,
									runId: event.data.runId
								}))
							}
							break
						case 'tool_call':
							setStreamingMessage(prev => ({
								text: '',
								runId: prev?.runId || event.data?.runId
							}))
							break
						case 'run.completed':
						case 'run.cancelled':
						case 'run.failed':
							setStreamingMessage(null)
							loadWorkspace(selectedConversationId).catch(() => {})
							break
						case 'approval.requested':
							loadWorkspace(selectedConversationId).catch(() => {})
							break
					}
				},
				onError: () => {
					setUseSSE(false)
				},
				onClose: () => {}
			}
		)

		return () => sse.close()
	}, [isLoggedIn, selectedConversationId, useSSE, setStreamingMessage, loadWorkspace])

	// Fallback polling when SSE is unavailable
	useEffect(() => {
		if (!isLoggedIn || useSSE) return
		let cancelled = false
		const timer = window.setInterval(async () => {
			if (cancelled) return
			try {
				await loadWorkspace(selectedIdRef.current)
			} catch {
				// 401 is handled by the axios interceptor.
				// Other errors are silently ignored during background refresh.
			}
		}, FALLBACK_REFRESH_MS)
		return () => {
			cancelled = true
			window.clearInterval(timer)
		}
	}, [isLoggedIn, useSSE, loadWorkspace])
}
