import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useI18n } from '../../i18n/context.jsx'
import { api } from '../../lib/api.js'
import { formatDate, formatJson } from '../../lib/format.js'
import { StatusBadge } from '../../components/shared/StatusBadge.jsx'
import { Button } from '../../components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx'

export default function ApprovalsPage() {
	const { data, loadAdmin, runAction } = useAdmin()
	const { t } = useI18n()
	const [refreshing, setRefreshing] = useState(false)
	const approvals = data?.approvals || []

	const handleRefresh = async () => {
		setRefreshing(true)
		try {
			await loadAdmin()
		} finally {
			setRefreshing(false)
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">{t('admin.approvals.title')}</h1>
					<p className="mt-1 text-sm text-muted-foreground">{t('admin.approvals.description')}</p>
				</div>
				<Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
					<RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
					{t('common.refresh')}
				</Button>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t('admin.approvals.approvalQueue')}</CardTitle>
					<CardDescription>{t('admin.approvals.approvalQueueDescription')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{approvals.map(approval => (
						<div key={approval.id} className="rounded-lg border p-4">
							<div className="flex flex-wrap items-center gap-2">
								<StatusBadge status={approval.status} />
								<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{approval.toolName}</span>
								<span className="text-xs text-muted-foreground">{formatDate(approval.requestedAt)}</span>
							</div>
							<p className="mt-3 text-sm">{approval.reason}</p>
							<pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100 dark:bg-slate-900">{formatJson(approval.toolInput)}</pre>
							<div className="mt-4 flex gap-3">
								<Button onClick={() => runAction(`approve-${approval.id}`, async () => {
									await api.adminDecideApproval(approval.id, { decision: 'approve' })
									await loadAdmin()
								})}>{t('common.approve')}</Button>
								<Button onClick={() => runAction(`deny-${approval.id}`, async () => {
									await api.adminDecideApproval(approval.id, { decision: 'deny' })
									await loadAdmin()
								})} variant="outline">{t('common.deny')}</Button>
							</div>
						</div>
					))}
					{approvals.length === 0 && <p className="text-sm text-muted-foreground">{t('admin.approvals.noApprovals')}</p>}
				</CardContent>
			</Card>
		</div>
	)
}
