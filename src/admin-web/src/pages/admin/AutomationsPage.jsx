import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useI18n } from '../../i18n/context.jsx'
import { api } from '../../lib/api.js'
import { formatDate, formatSchedule } from '../../lib/format.js'
import { StatusBadge } from '../../components/shared/StatusBadge.jsx'
import { Button } from '../../components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx'
import { Input } from '../../components/ui/input.jsx'
import { Textarea } from '../../components/ui/textarea.jsx'
import { CronEditor } from '../../components/automation/CronEditor.jsx'

function EditForm({ automation, onSave, onCancel, t }) {
	const [form, setForm] = useState({
		name: automation.name,
		instruction: automation.instruction,
		scheduleKind: automation.scheduleKind === 'interval' ? 'cron' : (automation.scheduleKind || 'cron'),
		cronExpression: automation.cronExpression || '0 9 * * *',
		scheduledAt: automation.scheduledAt ? automation.scheduledAt.slice(0, 16) : ''
	})

	function handleSubmit(e) {
		e.preventDefault()
		const updates = { name: form.name, instruction: form.instruction, scheduleKind: form.scheduleKind }
		if (form.scheduleKind === 'cron') {
			updates.cronExpression = form.cronExpression
		} else if (form.scheduleKind === 'once') {
			updates.scheduledAt = form.scheduledAt ? new Date(form.scheduledAt).toISOString() : ''
		}
		onSave(updates)
	}

	return (
		<form className="mt-3 space-y-3 rounded border bg-muted/50 p-3" onSubmit={handleSubmit}>
			<Input value={form.name} onChange={e => setForm(c => ({ ...c, name: e.target.value }))} placeholder="Name" />
			<Textarea className="min-h-[5rem]" value={form.instruction} onChange={e => setForm(c => ({ ...c, instruction: e.target.value }))} placeholder="Instruction" />
			<div className="flex items-center gap-2">
				<select className="rounded-md border bg-background px-2 py-1.5 text-sm" value={form.scheduleKind} onChange={e => setForm(c => ({ ...c, scheduleKind: e.target.value }))}>
					<option value="cron">Cron</option>
					<option value="once">Once</option>
				</select>
				{form.scheduleKind === 'once' && (
					<Input className="w-52" type="datetime-local" value={form.scheduledAt} onChange={e => setForm(c => ({ ...c, scheduledAt: e.target.value }))} />
				)}
			</div>
			{form.scheduleKind === 'cron' && (
				<CronEditor value={form.cronExpression} onChange={cron => setForm(c => ({ ...c, cronExpression: cron }))} />
			)}
			<div className="flex gap-2">
				<Button type="submit" size="sm">{t('common.save')}</Button>
				<Button type="button" size="sm" variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
			</div>
		</form>
	)
}

export default function AutomationsPage() {
	const { data, loadAdmin, runAction, busyKey } = useAdmin()
	const { t } = useI18n()
	const automations = data?.automations || []
	const users = data?.users || []
	const userMap = useMemo(() => {
		const map = {}
		for (const u of users) map[u.id] = u.displayName || u.loginName
		return map
	}, [users])
	const [editingId, setEditingId] = useState(null)
	const isRefreshing = busyKey === 'refresh-automations'

	async function handleRefresh() {
		await runAction('refresh-automations', async () => {
			await loadAdmin()
		})
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">{t('admin.automations.title')}</h1>
					<p className="mt-1 text-sm text-muted-foreground">{t('admin.automations.description')}</p>
				</div>
				<Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
					<RefreshCw className={`mr-1.5 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
					{t('common.refresh')}
				</Button>
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
										{t('admin.automations.owner')} {userMap[automation.ownerUserId] || automation.ownerUserId} · {formatSchedule(automation)} · {t('admin.automations.next')} {formatDate(automation.nextRunAt)}
									</div>
								</div>
								<StatusBadge status={automation.status} />
							</div>
							<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{automation.instruction}</p>

							{editingId === automation.id ? (
								<EditForm
									automation={automation}
									t={t}
									onSave={async (updates) => {
										await runAction(`edit-auto-${automation.id}`, async () => {
											await api.adminEditAutomation(automation.id, updates)
											setEditingId(null)
											await loadAdmin()
										})
									}}
									onCancel={() => setEditingId(null)}
								/>
							) : (
								<div className="mt-4 flex gap-3">
									{automation.status === 'active' && (
										<Button onClick={() => runAction(`pause-auto-${automation.id}`, async () => {
											await api.adminPauseAutomation(automation.id)
											await loadAdmin()
										})} variant="outline" size="sm">{t('common.pause')}</Button>
									)}
									{automation.status === 'paused' && (
										<Button onClick={() => runAction(`resume-auto-${automation.id}`, async () => {
											await api.adminResumeAutomation(automation.id)
											await loadAdmin()
										})} variant="outline" size="sm">{t('common.resume')}</Button>
									)}
									<Button onClick={() => setEditingId(automation.id)} variant="outline" size="sm">{t('common.edit')}</Button>
									<Button onClick={() => runAction(`delete-auto-${automation.id}`, async () => {
										await api.adminDeleteAutomation(automation.id)
										await loadAdmin()
									})} variant="destructive" size="sm">{t('common.delete')}</Button>
								</div>
							)}
						</div>
					))}
					{automations.length === 0 && <p className="text-sm text-muted-foreground">{t('admin.automations.noAutomations')}</p>}
				</CardContent>
			</Card>
		</div>
	)
}
