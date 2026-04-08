import { cn } from '../../lib/utils.js'

export function RiskPill({ riskLevel }) {
	const cls = riskLevel === 'dangerous'
		? 'border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300'
		: 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
	return (
		<span className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]', cls)}>
			{riskLevel}
		</span>
	)
}
