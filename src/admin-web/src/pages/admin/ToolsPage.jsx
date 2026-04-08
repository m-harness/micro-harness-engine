import { useAdmin } from '../../hooks/useAdmin.js'
import { useI18n } from '../../i18n/context.jsx'
import { formatJson } from '../../lib/format.js'
import { McpBadge, McpStatusPill } from '../../components/shared/McpBadge.jsx'
import { RiskPill } from '../../components/shared/RiskPill.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx'

export default function ToolsPage() {
	const { data } = useAdmin()
	const { t } = useI18n()
	const toolCatalog = data?.tools || []
	const mcpServers = data?.mcpServers || []

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">{t('admin.tools.title')}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{t('admin.tools.description')}</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t('admin.tools.tools')}</CardTitle>
					<CardDescription>{t('admin.tools.toolsRegistered', { count: toolCatalog.length })}</CardDescription>
					{mcpServers.length > 0 && (
						<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
							<span className="font-semibold">{t('admin.tools.mcpStatus')}</span>
							<span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />{t('admin.tools.ready')}</span>
							<span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />{t('admin.tools.connecting')}</span>
							<span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-rose-400" />{t('admin.tools.failed')}</span>
							<span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-300" />{t('admin.tools.disconnected')}</span>
						</div>
					)}
				</CardHeader>
				<CardContent className="grid gap-3">
					{toolCatalog.map(tool => (
						<div key={tool.name} className="rounded-lg border px-4 py-3">
							<div className="flex items-center justify-between gap-3">
								<div className="flex items-center gap-2">
									<span className="text-sm font-semibold">{tool.name}</span>
									{tool.source === 'mcp' && <McpBadge />}
								</div>
								<div className="flex items-center gap-2">
									{tool.source === 'mcp' && <McpStatusPill serverName={tool.mcpServerName} mcpServers={mcpServers} />}
									<RiskPill riskLevel={tool.riskLevel} />
								</div>
							</div>
							<div className="mt-1 text-xs text-muted-foreground">{tool.description}</div>
							<div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.tools.inputSchema')}</div>
							<pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100 dark:bg-slate-900">{formatJson(tool.inputSchema || {})}</pre>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	)
}
