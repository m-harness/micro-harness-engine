import { useAtom } from 'jotai'
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../lib/api.js'
import { setAdminCsrfToken } from '../lib/axios.js'
import { adminDataAtom } from '../stores/admin.js'
import { adminAuthStateAtom } from '../stores/auth.js'
import { adminBusyKeyAtom } from '../stores/ui.js'

export function useAdmin() {
	const [adminAuth, setAdminAuth] = useAtom(adminAuthStateAtom)
	const [data, setData] = useAtom(adminDataAtom)
	const [busyKey, setBusyKey] = useAtom(adminBusyKeyAtom)
	const navigate = useNavigate()

	const loadAdmin = useCallback(async () => {
		const nextAuth = await api.getAdminAuthState()
		setAdminCsrfToken(nextAuth.csrfToken)
		setAdminAuth(nextAuth)
		if (!nextAuth.adminAuthenticated) {
			setData(null)
			return
		}
		setData(await api.getAdminBootstrap())
	}, [setAdminAuth, setData])

	const pollUntilMcpSettled = useCallback(async (serverName, { interval = 2000, maxAttempts = 8 } = {}) => {
		for (let i = 0; i < maxAttempts; i++) {
			await new Promise(r => setTimeout(r, interval))
			const bootstrap = await api.getAdminBootstrap()
			setData(bootstrap)
			const server = (bootstrap.mcpServerConfigs || []).find(s => s.name === serverName)
			if (!server || server.state === 'ready' || server.state === 'failed') return
		}
	}, [setData])

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

	const adminLogin = useCallback(async (loginForm) => {
		await api.adminLogin(loginForm)
		await loadAdmin()
		navigate('/admin')
	}, [loadAdmin, navigate])

	const adminLogout = useCallback(async () => {
		await api.adminLogout()
		setAdminCsrfToken('')
		setData(null)
		await loadAdmin()
		navigate('/admin/login')
	}, [loadAdmin, navigate, setData])

	return {
		adminAuth,
		data,
		busyKey,
		loadAdmin,
		pollUntilMcpSettled,
		runAction,
		adminLogin,
		adminLogout
	}
}
