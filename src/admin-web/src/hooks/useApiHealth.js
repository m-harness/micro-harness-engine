import { useAtom } from 'jotai'
import { useEffect, useRef } from 'react'
import axios from 'axios'
import { apiStatusAtom } from '../stores/apiStatus.js'

const INITIAL_INTERVAL = 1000
const MAX_INTERVAL = 5000

/**
 * Polls /api/health with escalating backoff (1s → 5s).
 * Updates apiStatusAtom: 'unknown' → 'connecting' | 'online'.
 * Stops polling once online; resumes if a network error is detected.
 */
export function useApiHealth() {
	const [status, setStatus] = useAtom(apiStatusAtom)
	const intervalRef = useRef(INITIAL_INTERVAL)
	const timerRef = useRef(null)

	useEffect(() => {
		let cancelled = false

		async function check() {
			try {
				// Use raw axios to bypass our interceptor (which transforms errors)
				await axios.get('/api/health', { timeout: 3000 })
				if (!cancelled) {
					setStatus('online')
					intervalRef.current = INITIAL_INTERVAL
				}
			} catch {
				if (!cancelled) {
					setStatus(prev => prev === 'online' ? 'online' : 'connecting')
				}
			}

			if (!cancelled) {
				timerRef.current = setTimeout(check, intervalRef.current)
				// Escalate interval: 1s → 2s → 3s → 4s → 5s
				intervalRef.current = Math.min(intervalRef.current + 1000, MAX_INTERVAL)
			}
		}

		check()

		return () => {
			cancelled = true
			if (timerRef.current) clearTimeout(timerRef.current)
		}
	}, [setStatus])

	return status
}
