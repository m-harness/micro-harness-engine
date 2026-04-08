import { cn } from '../../lib/utils.js'

const toneClasses = {
	default: 'bg-primary/10 text-primary',
	success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
	warn: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
	danger: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
}

export function Badge({ className, tone = 'default', ...props }) {
	return (
		<span
			className={cn(
				'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition-colors',
				toneClasses[tone] || toneClasses.default,
				className
			)}
			{...props}
		/>
	)
}
