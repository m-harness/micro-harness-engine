import { useI18n } from '../../i18n/context.jsx'
import { useWorkspace } from '../../hooks/useWorkspace.js'
import { formatJson } from '../../lib/format.js'
import { StatusBadge } from '../shared/StatusBadge.jsx'
import { Button } from '../ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx'

export function ApprovalsPanel({ approvals }) {
	const { t } = useI18n()
	const { handleApproval, busyKey } = useWorkspace()

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t('panels.approvalTitle')}</CardTitle>
				<CardDescription>{t('panels.approvalDescription')}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{approvals.length > 0 ? approvals.map(approval => (
					<div key={approval.id} className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-800 dark:bg-amber-950/50">
						<div className="flex flex-wrap items-center gap-2">
							<StatusBadge status={approval.status} />
							<span className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-300">{approval.toolName}</span>
						</div>
						<p className="mt-3 text-sm font-medium">{approval.reason}</p>
						<pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100 dark:bg-slate-900">{formatJson(approval.toolInput)}</pre>
						<div className="mt-4 flex gap-3">
							<Button disabled={busyKey === `approval-${approval.id}`} onClick={() => handleApproval(approval.id, 'approve')}>{t('common.approve')}</Button>
							<Button disabled={busyKey === `approval-${approval.id}`} onClick={() => handleApproval(approval.id, 'deny')} variant="outline">{t('common.deny')}</Button>
						</div>
					</div>
				)) : (
					<p className="text-sm text-muted-foreground">{t('panels.noApprovals')}</p>
				)}
			</CardContent>
		</Card>
	)
}
