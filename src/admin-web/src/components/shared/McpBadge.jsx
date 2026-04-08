import { cn } from '../../lib/utils.js'

export function McpBadge() {
	return (
		<span className="inline-flex rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-400">
			MCP
		</span>
	)
}

function mcpStateClass(state) {
	switch (state) {
		case 'ready':
			return 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
		case 'connecting':
			return 'border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
		case 'failed':
			return 'border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300'
		case 'disconnected':
		default:
			return 'border-border bg-muted text-muted-foreground'
	}
}

export function McpStatusPill({ serverName, mcpServers }) {
	const server = mcpServers.find(s => s.name === serverName)
	const state = server?.state || 'unknown'
	const lastError = server?.lastError
	return (
		<span
			className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold', mcpStateClass(state))}
			title={state === 'failed' && lastError ? `Error: ${lastError}` : undefined}
		>
			{state}
		</span>
	)
}
