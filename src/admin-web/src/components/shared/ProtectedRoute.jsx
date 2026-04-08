import { useAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { setAdminCsrfToken, setUserCsrfToken } from '../../lib/axios.js'
import { adminAuthStateAtom, authStateAtom } from '../../stores/auth.js'

export function ProtectedRoute({ type = 'user' }) {
	const [authState, setAuthState] = useAtom(authStateAtom)
	const [adminAuth, setAdminAuth] = useAtom(adminAuthStateAtom)
	const [checking, setChecking] = useState(true)
	const location = useLocation()

	useEffect(() => {
		let cancelled = false

		async function check() {
			try {
				if (type === 'admin') {
					const state = await api.getAdminAuthState()
					if (!cancelled) {
						setAdminCsrfToken(state.csrfToken)
						setAdminAuth(state)
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
					}
				}
			} catch {
				// auth check failed - will redirect to login
			} finally {
				if (!cancelled) setChecking(false)
			}
		}

		check()
		return () => { cancelled = true }
	}, [type, setAuthState, setAdminAuth])

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
