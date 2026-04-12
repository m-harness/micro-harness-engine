import { useAtom } from 'jotai'
import { useCallback, useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { setAdminCsrfToken, setUserCsrfToken } from '../../lib/axios.js'
import { adminAuthStateAtom, authStateAtom } from '../../stores/auth.js'
import { apiStatusAtom } from '../../stores/apiStatus.js'
import { ServerStartingOverlay } from './ServerStartingOverlay.jsx'

export function ProtectedRoute({ type = 'user' }) {
	const [authState, setAuthState] = useAtom(authStateAtom)
	const [adminAuth, setAdminAuth] = useAtom(adminAuthStateAtom)
	const [, setApiStatus] = useAtom(apiStatusAtom)
	const [checking, setChecking] = useState(true)
	const [serverDown, setServerDown] = useState(false)
	const [retryKey, setRetryKey] = useState(0)
	const location = useLocation()

	useEffect(() => {
		let cancelled = false

		async function check() {
			setChecking(true)
			setServerDown(false)
			let isServerDown = false

			try {
				if (type === 'admin') {
					const state = await api.getAdminAuthState()
					if (!cancelled) {
						setAdminCsrfToken(state.csrfToken)
						setAdminAuth(state)
						setApiStatus('online')
					}
				} else {
					const me = await api.getAuthState()
					if (!cancelled) {
						setUserCsrfToken(me.csrfToken)
						setAuthState({
							user: me.user,
							csrfToken: me.csrfToken || '',
							bootstrapRequired: me.bootstrapRequired,
							webBootstrapEnabled: me.webBootstrapEnabled
						})
						setApiStatus('online')
					}
				}
			} catch (err) {
				if (!cancelled && err.serverUnavailable) {
					isServerDown = true
					setServerDown(true)
					setApiStatus('connecting')
				}
				// Normal HTTP error (401 etc.) — will redirect to login
			} finally {
				if (!cancelled && !isServerDown) setChecking(false)
			}
		}

		check()
		return () => { cancelled = true }
	}, [type, retryKey, setAuthState, setAdminAuth, setApiStatus])

	const handleRetry = useCallback(() => {
		setRetryKey(k => k + 1)
	}, [])

	if (serverDown) {
		return <ServerStartingOverlay onRetry={handleRetry} />
	}

	if (checking) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="animate-pulse rounded-2xl border bg-card px-6 py-5 text-sm font-semibold tracking-widest text-muted-foreground">
					Authenticating...
				</div>
			</div>
		)
	}

	if (type === 'admin') {
		if (!adminAuth.adminAuthenticated) {
			return <Navigate to="/admin/login" state={{ from: location }} replace />
		}
	} else {
		if (!authState.user) {
			return <Navigate to="/login" state={{ from: location }} replace />
		}
	}

	return <Outlet />
}
