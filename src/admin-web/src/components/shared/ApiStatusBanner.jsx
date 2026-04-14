import { useAtom } from 'jotai'
import { apiStatusAtom } from '../../stores/apiStatus.js'
import { useI18n } from '../../i18n/context.jsx'

/**
 * Amber banner shown at the top of the page when the API is not yet available.
 * Visible on login pages and anywhere else while status === 'connecting'.
 */
export function ApiStatusBanner() {
	const [status] = useAtom(apiStatusAtom)
	const { t } = useI18n()

	if (status !== 'connecting') return null

	return (
		<div className="flex items-center justify-center gap-2 bg-amber-500/90 px-4 py-2 text-sm font-medium text-white dark:bg-amber-600/90">
			<div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
			{t('apiStatus.connecting')}
		</div>
	)
}
