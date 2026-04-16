import { cn } from '../../lib/utils.js'

export function RiskPill({ riskLevel }) {
	const cls = riskLevel === 'dangerous'
		? 'border-rose-200/60 bg-rose-50 text-rose-600 dark:border-rose-800/40 dark:bg-rose-950/50 dark:text-rose-400'
		: 'border-emerald-200/60 bg-emerald-50 text-emerald-600 dark:border-emerald-800/40 dark:bg-emerald-950/50 dark:text-emerald-400'
	return (
		<span className={cn('inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-medium uppercase leading-4 tracking-wider', cls)}>
			{riskLevel}
		</span>
	)
}
