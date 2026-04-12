import { useAtom } from 'jotai'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../lib/api.js'
import { createSSEConnection } from '../lib/sse.js'
import { setUserCsrfToken } from '../lib/axios.js'
import { authStateAtom } from '../stores/auth.js'
import { workspaceBusyKeyAtom } from '../stores/ui.js'
import { conversationViewAtom, selectedConversationIdAtom, streamingMessageAtom, workspaceAtom } from '../stores/workspace.js'

const FALLBACK_REFRESH_MS = 4000

export function useWorkspace() {
	const [authState, setAuthState] = useAtom(authStateAtom)
	const [workspace, setWorkspace] = useAtom(workspaceAtom)
	const [selectedConversationId, setSelectedConversationId] = useAtom(selectedConversationIdAtom)
	const [conversationView, setConversationView] = useAtom(conversationViewAtom)
	const [streamingMessage, setStreamingMessage] = useAtom(streamingMessageAtom)
	const [busyKey, setBusyKey] = useAtom(workspaceBusyKeyAtom)
	const [useSSE, setUseSSE] = useState(true)
	const navigate = useNavigate()
	const selectedIdRef = useRef(selectedConversationId)
	selectedIdRef.current = selectedConversationId

	// Stable boolean flag: avoids SSE reconnection when authState.user
	// object reference changes (e.g. after loadWorkspace).
	const isLoggedIn = !!authState.user

	const loadConversation = useCallback(async (conversationId, conversations) => {
		if (!conversationId) {
			setSelectedConversationId(null)
			setConversationView(null)
			return
		}
		try {
			const detail = await api.getConversation(conversationId)
			setSelectedConversationId(conversationId)
			setConversationView(detail)
		} catch (error) {
			const fallbackId = conversations[0]?.id || null
			if (!fallbackId || fallbackId === conversationId) throw error
			const detail = await api.getConversation(fallbackId)
			setSelectedConversationId(fallbackId)
			setConversationView(detail)
		}
	}, [setSelectedConversationId, setConversationView])

	const initWorkspace = useCallback(async () => {
		const data = await api.getBootstrap()
		setWorkspace({
			conversations: data.conversations || [],
			apiTokens: data.apiTokens || []
		})
		setAuthState(current => ({
			...current,
			user: data.user,
			csrfToken: data.csrfToken || current.csrfToken
		}))
		if (data.csrfToken) setUserCsrfToken(data.csrfToken)
		return data
	}, [setWorkspace, setAuthState])

	const loadWorkspace = useCallback(async (preferredConversationId = null) => {
		const data = await initWorkspace()
		const conversationId = preferredConversationId || selectedIdRef.current || data.conversations?.[0]?.id || null
		await loadConversation(conversationId, data.conversations || [])
	}, [initWorkspace, loadConversation])

	const runAction = useCallback(async (key, callback) => {
		setBusyKey(key)
		try {
			await callback()
		} catch (error) {
			toast.error(error.message)
		} finally {
			setBusyKey('')
		}
	}, [setBusyKey])

	const createConversation = useCallback(async () => {
		await runAction('create-conversation', async () => {
			const created = await api.createConversation({ title: 'New Conversation' })
			await loadWorkspace(created.id)
			navigate(`/c/${created.id}`)
		})
	}, [runAction, loadWorkspace, navigate])

	const selectConversation = useCallback(async (conversationId) => {
		setStreamingMessage(null)
		await runAction(`select-${conversationId}`, async () => {
			await loadConversation(conversationId, workspace.conversations)
			navigate(`/c/${conversationId}`)
		})
	}, [runAction, loadConversation, workspace.conversations, navigate, setStreamingMessage])

	const sendMessage = useCallback(async (text) => {
		if (!text.trim()) return
		await runAction('send-message', async () => {
			let conversationId = selectedIdRef.current
			if (!conversationId) {
				const created = await api.createConversation({ title: 'New Conversation' })
				conversationId = created.id
			}
			await api.postConversationMessage(conversationId, { text })
			await loadWorkspace(conversationId)
		})
	}, [runAction, loadWorkspace])

	const cancelRun = useCallback(async (runId) => {
		await runAction('cancel-run', async () => {
			await api.cancelRun(runId)
			setStreamingMessage(null)
			await loadWorkspace(selectedIdRef.current)
		})
	}, [runAction, loadWorkspace, setStreamingMessage])

	const handleApproval = useCallback(async (approvalId, decision) => {
		await runAction(`approval-${approvalId}`, async () => {
			await api.decideApproval(approvalId, { decision })
			await loadWorkspace(selectedIdRef.current)
		})
	}, [runAction, loadWorkspace])

	const createAutomation = useCallback(async ({ name, instruction, intervalMinutes }) => {
		if (!selectedIdRef.current) {
			toast.error('Create or select a conversation first.')
			return
		}
		await runAction('create-automation', async () => {
			await api.createAutomation(selectedIdRef.current, {
				name,
				instruction,
				intervalMinutes: Number.parseInt(intervalMinutes, 10)
			})
			await loadWorkspace(selectedIdRef.current)
		})
	}, [runAction, loadWorkspace])

	const updateAutomationStatus = useCallback(async (automationId, status) => {
		await runAction(`automation-${automationId}`, async () => {
			await api.updateAutomationStatus(automationId, { status })
			await loadWorkspace(selectedIdRef.current)
		})
	}, [runAction, loadWorkspace])

	const runAutomationNow = useCallback(async (automationId) => {
		await runAction(`run-${automationId}`, async () => {
			await api.runAutomationNow(automationId)
			await loadWorkspace(selectedIdRef.current)
		})
	}, [runAction, loadWorkspace])

	const deleteAutomation = useCallback(async (automationId) => {
		await runAction(`delete-${automationId}`, async () => {
			await api.deleteAutomation(automationId)
			await loadWorkspace(selectedIdRef.current)
		})
	}, [runAction, loadWorkspace])

	const createToken = useCallback(async (name) => {
		let result = null
		await runAction('create-token', async () => {
			result = await api.createToken({ name })
			await loadWorkspace(selectedIdRef.current)
		})
		return result
	}, [runAction, loadWorkspace])

	const revokeToken = useCallback(async (tokenId) => {
		await runAction(`revoke-${tokenId}`, async () => {
			await api.revokeToken(tokenId)
			await loadWorkspace(selectedIdRef.current)
		})
	}, [runAction, loadWorkspace])

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

	return {
		workspace,
		selectedConversationId,
		conversationView,
		streamingMessage,
		busyKey,
		initWorkspace,
		loadWorkspace,
		loadConversation,
		createConversation,
		selectConversation,
		sendMessage,
		cancelRun,
		handleApproval,
		createAutomation,
		updateAutomationStatus,
		runAutomationNow,
		deleteAutomation,
		createToken,
		revokeToken,
		runAction
	}
}
