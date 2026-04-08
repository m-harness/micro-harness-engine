import { useAtom } from 'jotai'
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../lib/api.js'
import { setUserCsrfToken } from '../lib/axios.js'
import { authStateAtom } from '../stores/auth.js'
import { conversationViewAtom, selectedConversationIdAtom, workspaceAtom } from '../stores/workspace.js'

export function useAuth() {
	const [authState, setAuthState] = useAtom(authStateAtom)
	const [, setWorkspace] = useAtom(workspaceAtom)
	const [, setSelectedConversationId] = useAtom(selectedConversationIdAtom)
	const [, setConversationView] = useAtom(conversationViewAtom)
	const navigate = useNavigate()

	const hydrate = useCallback(async () => {
		const me = await api.getAuthState()
		setUserCsrfToken(me.csrfToken)
		setAuthState({
			user: me.user,
			csrfToken: me.csrfToken || '',
			bootstrapRequired: me.bootstrapRequired,
			webBootstrapEnabled: me.webBootstrapEnabled
		})

		if (me.user) {
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

			const firstId = data.conversations?.[0]?.id || null
			if (firstId) {
				const detail = await api.getConversation(firstId)
				setSelectedConversationId(firstId)
				setConversationView(detail)
			}
		} else {
			setWorkspace({ conversations: [], apiTokens: [] })
			setSelectedConversationId(null)
			setConversationView(null)
		}
	}, [setAuthState, setWorkspace, setSelectedConversationId, setConversationView])

	const login = useCallback(async (loginForm) => {
		await api.login(loginForm)
		await hydrate()
		toast.success('Signed in.')
	}, [hydrate])

	const logout = useCallback(async () => {
		await api.logout()
		setUserCsrfToken('')
		setWorkspace({ conversations: [], apiTokens: [] })
		setSelectedConversationId(null)
		setConversationView(null)
		await hydrate()
		navigate('/login')
	}, [hydrate, navigate, setWorkspace, setSelectedConversationId, setConversationView])

	return { authState, hydrate, login, logout }
}
