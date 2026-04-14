import { useAtom } from 'jotai'
import { useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../lib/api.js'
import { setUserCsrfToken } from '../lib/axios.js'
import { authStateAtom } from '../stores/auth.js'
import { workspaceBusyKeyAtom } from '../stores/ui.js'
import { conversationViewAtom, selectedConversationIdAtom, streamingMessageAtom, workspaceAtom } from '../stores/workspace.js'

export function useWorkspace() {
	const [authState, setAuthState] = useAtom(authStateAtom)
	const [workspace, setWorkspace] = useAtom(workspaceAtom)
	const [selectedConversationId, setSelectedConversationId] = useAtom(selectedConversationIdAtom)
	const [conversationView, setConversationView] = useAtom(conversationViewAtom)
	const [streamingMessage, setStreamingMessage] = useAtom(streamingMessageAtom)
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

	const createAutomation = useCallback(async ({ name, instruction, scheduleKind, cronExpression, scheduledAt }) => {
		if (!selectedIdRef.current) {
			toast.error('Create or select a conversation first.')
			return
		}
		await runAction('create-automation', async () => {
			await api.createAutomation(selectedIdRef.current, {
				name,
				instruction,
				scheduleKind,
				cronExpression,
				scheduledAt
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

	const editAutomation = useCallback(async (automationId, updates) => {
		await runAction(`edit-${automationId}`, async () => {
			await api.editAutomation(automationId, updates)
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
		editAutomation,
		updateAutomationStatus,
		runAutomationNow,
		deleteAutomation,
		createToken,
		revokeToken,
		runAction
	}
}
