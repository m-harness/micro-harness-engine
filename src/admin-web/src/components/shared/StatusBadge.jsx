import { cn } from '../../lib/utils.js'

function statusClass(status) {
	switch (status) {
		case 'active':
		case 'completed':
		case 'approved':
		case 'ready':
			return 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
		case 'queued':
		case 'running':
		case 'waiting_approval':
		case 'pending':
			return 'border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
		case 'recovering':
			return 'border-orange-200 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300'
		case 'paused':
		case 'disabled':
			return 'border-border bg-muted text-muted-foreground'
		case 'denied':
		case 'failed':
		case 'deleted':
			return 'border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300'
		default:
			return 'border-border bg-muted text-muted-foreground'
	}
}

export function StatusBadge({ status, children, className }) {
	return (
		<span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', statusClass(status), className)}>
			{children || status}
		</span>
	)
}
