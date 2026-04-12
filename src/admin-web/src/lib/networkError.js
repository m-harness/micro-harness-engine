/**
 * Determine whether an axios error indicates the server is unavailable
 * (as opposed to a normal HTTP error like 401/500).
 *
 * - No response at all → pure network error (ECONNREFUSED, DNS failure, etc.)
 * - 502/503/504 → Vite proxy could not reach the backend
 */
export function isServerUnavailable(error) {
	if (!error) return false

	// Axios wraps the original error; check for response presence
	const status = error.response?.status ?? error.status

	// No HTTP response at all → network-level failure
	if (status === undefined || status === null) {
		// Check if it's a wrapped error from our axios interceptor
		// Our interceptor creates new Error(message) which loses .response
		// So also check the message for network-related patterns
		const msg = error.message || ''
		if (msg === 'Network Error' || msg.includes('ECONNREFUSED') || msg.includes('ERR_CONNECTION')) {
			return true
		}
		return !error.response && !status
	}

	// Proxy gateway errors → backend unreachable
	return status === 502 || status === 503 || status === 504
}
