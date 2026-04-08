import { useAdmin } from '../../hooks/useAdmin.js'
import { useI18n } from '../../i18n/context.jsx'
import { api } from '../../lib/api.js'
import { formatDate } from '../../lib/format.js'
import { StatusBadge } from '../../components/shared/StatusBadge.jsx'
import { Button } from '../../components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx'

export default function AutomationsPage() {
	const { data, loadAdmin, runAction } = useAdmin()
	const { t } = useI18n()
	const automations = data?.automations || []

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">{t('admin.automations.title')}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{t('admin.automations.description')}</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t('admin.automations.activeAutomations')}</CardTitle>
					<CardDescription>{t('admin.automations.activeDescription')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{automations.map(automation => (
						<div key={automation.id} className="rounded-lg border p-4">
							<div className="flex items-start justify-between gap-3">
								<div>
									<div className="text-sm font-semibold">{automation.name}</div>
									<div className="mt-1 text-xs text-muted-foreground">
										{t('admin.automations.owner')} {automation.ownerUserId} · {t('admin.automations.next')} {formatDate(automation.nextRunAt)}
									</div>
								</div>
								<StatusBadge status={automation.status} />
							</div>
							<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{automation.instruction}</p>
							<div className="mt-4 flex gap-3">
								<Button onClick={() => runAction(`pause-auto-${automation.id}`, async () => {
									await api.adminPauseAutomation(automation.id)
									await loadAdmin()
								})} variant="outline" size="sm">{t('common.pause')}</Button>
								<Button onClick={() => runAction(`delete-auto-${automation.id}`, async () => {
									await api.adminDeleteAutomation(automation.id)
									await loadAdmin()
								})} variant="destructive" size="sm">{t('common.delete')}</Button>
							</div>
						</div>
					))}
					{automations.length === 0 && <p className="text-sm text-muted-foreground">{t('admin.automations.noAutomations')}</p>}
				</CardContent>
			</Card>
		</div>
	)
}
