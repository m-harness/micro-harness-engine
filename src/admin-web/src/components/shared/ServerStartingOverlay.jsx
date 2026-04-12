import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/context.jsx'

const RETRY_SECONDS = 3

/**
 * Full-screen overlay shown when the API server is unreachable.
 * Displays a countdown and calls onRetry every 3 seconds.
 */
export function ServerStartingOverlay({ onRetry }) {
	const { t } = useI18n()
	const [countdown, setCountdown] = useState(RETRY_SECONDS)

	useEffect(() => {
		setCountdown(RETRY_SECONDS)
		const timer = setInterval(() => {
			setCountdown(prev => {
				if (prev <= 1) {
					onRetry()
					return RETRY_SECONDS
				}
				return prev - 1
			})
		}, 1000)
		return () => clearInterval(timer)
	}, [onRetry])

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
			<div className="mx-4 flex max-w-sm flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-panel">
				{/* Spinner */}
				<div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />

				<h2 className="text-lg font-semibold text-foreground">
					{t('apiStatus.serverStarting')}
				</h2>
				<p className="text-sm text-muted-foreground">
					{t('apiStatus.serverStartingDescription')}
				</p>
				<p className="text-xs text-muted-foreground">
					{t('apiStatus.autoRetry', { seconds: countdown })}
				</p>
			</div>
		</div>
	)
}
