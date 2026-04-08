import { useAtom } from 'jotai'
import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../lib/api.js'
import { setUserCsrfToken } from '../lib/axios.js'
import { authStateAtom } from '../stores/auth.js'
import { workspaceBusyKeyAtom } from '../stores/ui.js'
import { conversationViewAtom, selectedConversationIdAtom, workspaceAtom } from '../stores/workspace.js'

const REFRESH_INTERVAL_MS = 4000

export function useWorkspace() {
	const [authState, setAuthState] = useAtom(authStateAtom)
	const [workspace, setWorkspace] = useAtom(workspaceAtom)
	const [selectedConversationId, setSelectedConversationId] = useAtom(selectedConversationIdAtom)
	const [conversationView, setConversationView] = useAtom(conversationViewAtom)
	const [busyKey, setBusyKey] = useAtom(workspaceBusyKeyAtom)
	const navigate = useNavigate()
	const selectedIdRef = useRef(selectedConversationId)
	selectedIdRef.current = selectedConversationId

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

	const loadWorkspace = useCallback(async (preferredConversationId = null) => {
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

		const conversationId = preferredConversationId || selectedIdRef.current || data.conversations?.[0]?.id || null
		await loadConversation(conversationId, data.conversations || [])
	}, [setWorkspace, setAuthState, loadConversation])

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
		await runAction(`select-${conversationId}`, async () => {
			await loadConversation(conversationId, workspace.conversations)
			navigate(`/c/${conversationId}`)
		})
	}, [runAction, loadConversation, workspace.conversations, navigate])

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

	useEffect(() => {
		if (!authState.user) return
		let cancelled = false
		const timer = window.setInterval(async () => {
			if (cancelled) return
			try {
				await loadWorkspace(selectedIdRef.current)
			} catch (error) {
				// 401 is handled by the axios interceptor (context-aware redirect).
				// Other errors (network, 5xx) are silently ignored during background refresh.
			}
		}, REFRESH_INTERVAL_MS)
		return () => {
			cancelled = true
			window.clearInterval(timer)
		}
	}, [authState.user, loadWorkspace])

	return {
		workspace,
		selectedConversationId,
		conversationView,
		busyKey,
		loadWorkspace,
		loadConversation,
		createConversation,
		selectConversation,
		sendMessage,
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
