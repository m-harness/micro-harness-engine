import axios from 'axios'
import { navigateTo, getPathname } from './navigateRef.js'

const instance = axios.create({
	withCredentials: true,
	headers: { 'Content-Type': 'application/json' }
})

let userCsrfToken = ''
let adminCsrfToken = ''

export function setUserCsrfToken(token) {
	userCsrfToken = token || ''
}

export function setAdminCsrfToken(token) {
	adminCsrfToken = token || ''
}

instance.interceptors.request.use(config => {
	const isAdmin = config.url?.startsWith('/api/admin/')
	const token = isAdmin ? adminCsrfToken : userCsrfToken
	if (token && config.method !== 'get') {
		config.headers['x-csrf-token'] = token
	}
	return config
})

instance.interceptors.response.use(
	response => {
		const payload = response.data
		if (payload && payload.ok === false) {
			return Promise.reject(new Error(payload.error || 'Request failed'))
		}
		return payload?.data !== undefined ? payload.data : payload
	},
	error => {
		if (error.response?.status === 401) {
			const isAdminRequest = error.config?.url?.startsWith('/api/admin/')
			const pathname = getPathname()
			const onAdminPage = pathname.startsWith('/admin')
			const onLoginPage = pathname === '/login' || pathname === '/admin/login'

			// Only redirect if the 401 matches the current page context
			if (!onLoginPage && isAdminRequest === onAdminPage) {
				navigateTo(isAdminRequest ? '/admin/login' : '/login')
			}
		}
		const message = error.response?.data?.error || error.message || 'Request failed'
		return Promise.reject(new Error(message))
	}
)

export default instance
