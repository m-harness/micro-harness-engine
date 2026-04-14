import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useI18n } from '../../i18n/context.jsx'
import { useWorkspace } from '../../hooks/useWorkspace.js'
import { formatDate, formatSchedule } from '../../lib/format.js'
import { StatusBadge } from '../shared/StatusBadge.jsx'
import { Button } from '../ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx'
import { Input } from '../ui/input.jsx'
import { Textarea } from '../ui/textarea.jsx'
import { CronEditor } from '../automation/CronEditor.jsx'

function EditForm({ automation, onSave, onCancel, busy, t }) {
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
			<Input value={form.name} onChange={e => setForm(c => ({ ...c, name: e.target.value }))} placeholder={t('panels.automationName')} />
			<Textarea className="min-h-[5rem]" value={form.instruction} onChange={e => setForm(c => ({ ...c, instruction: e.target.value }))} placeholder={t('panels.automationInstruction')} />
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
				<Button type="submit" size="sm" disabled={busy}>{t('common.save')}</Button>
				<Button type="button" size="sm" variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
			</div>
		</form>
	)
}

export function AutomationsPanel({ automations }) {
	const { t } = useI18n()
	const { createAutomation, editAutomation, updateAutomationStatus, runAutomationNow, deleteAutomation, loadWorkspace, runAction, busyKey } = useWorkspace()
	const [editingId, setEditingId] = useState(null)
	const [form, setForm] = useState({
		name: '',
		instruction: '',
		scheduleKind: 'cron',
		cronExpression: '0 9 * * *',
		scheduledAt: ''
	})

	const isRefreshing = busyKey === 'refresh-workspace'

	async function handleRefresh() {
		await runAction('refresh-workspace', async () => {
			await loadWorkspace()
		})
	}

	async function handleCreate(e) {
		e.preventDefault()
		const payload = { name: form.name, instruction: form.instruction, scheduleKind: form.scheduleKind }
		if (form.scheduleKind === 'cron') {
			payload.cronExpression = form.cronExpression
		} else if (form.scheduleKind === 'once') {
			payload.scheduledAt = form.scheduledAt ? new Date(form.scheduledAt).toISOString() : ''
		}
		await createAutomation(payload)
		setForm({ name: '', instruction: '', scheduleKind: 'cron', cronExpression: '0 9 * * *', scheduledAt: '' })
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>{t('panels.automationTitle')}</CardTitle>
						<CardDescription>{t('panels.automationDescription')}</CardDescription>
					</div>
					<Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="h-8 w-8 p-0">
						<RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<form className="space-y-3 rounded-lg border bg-muted/50 p-4" onSubmit={handleCreate}>
					<Input onChange={e => setForm(c => ({ ...c, name: e.target.value }))} placeholder={t('panels.automationName')} value={form.name} />
					<Textarea className="min-h-[6rem]" onChange={e => setForm(c => ({ ...c, instruction: e.target.value }))} placeholder={t('panels.automationInstruction')} value={form.instruction} />

					<div className="flex items-center gap-3">
						<select
							className="rounded-md border bg-background px-3 py-2 text-sm"
							value={form.scheduleKind}
							onChange={e => setForm(c => ({ ...c, scheduleKind: e.target.value }))}
						>
							<option value="cron">Cron</option>
							<option value="once">Once</option>
						</select>

						{form.scheduleKind === 'once' && (
							<Input className="w-56" type="datetime-local" onChange={e => setForm(c => ({ ...c, scheduledAt: e.target.value }))} value={form.scheduledAt} />
						)}

						<Button disabled={busyKey === 'create-automation'} type="submit" className="ml-auto">{t('common.create')}</Button>
					</div>

					{form.scheduleKind === 'cron' && (
						<CronEditor value={form.cronExpression} onChange={cron => setForm(c => ({ ...c, cronExpression: cron }))} />
					)}
				</form>

				{automations.length > 0 ? automations.map(automation => (
					<div key={automation.id} className="rounded-lg border p-4">
						<div className="flex items-start justify-between gap-3">
							<div>
								<div className="text-sm font-semibold">{automation.name}</div>
								<div className="mt-1 text-xs text-muted-foreground">{formatSchedule(automation)}</div>
							</div>
							<StatusBadge status={automation.status} />
						</div>
						<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{automation.instruction}</p>
						<div className="mt-2 text-xs text-muted-foreground">{t('panels.nextRun')} {formatDate(automation.nextRunAt)}</div>

						{editingId === automation.id ? (
							<EditForm
								automation={automation}
								t={t}
								busy={busyKey === `edit-${automation.id}`}
								onSave={async (updates) => {
									await editAutomation(automation.id, updates)
									setEditingId(null)
								}}
								onCancel={() => setEditingId(null)}
							/>
						) : (
							<div className="mt-3 flex flex-wrap gap-2">
								<Button disabled={busyKey === `run-${automation.id}`} onClick={() => runAutomationNow(automation.id)} size="sm" variant="secondary">{t('panels.runNow')}</Button>
								<Button disabled={busyKey === `automation-${automation.id}`} onClick={() => updateAutomationStatus(automation.id, automation.status === 'active' ? 'paused' : 'active')} size="sm" variant="outline">
									{automation.status === 'active' ? t('common.pause') : t('common.resume')}
								</Button>
								<Button onClick={() => setEditingId(automation.id)} size="sm" variant="outline">{t('common.edit')}</Button>
								<Button disabled={busyKey === `delete-${automation.id}`} onClick={() => { if (window.confirm('Delete this automation?')) deleteAutomation(automation.id) }} size="sm" variant="destructive">{t('common.delete')}</Button>
							</div>
						)}
					</div>
				)) : (
					<p className="text-sm text-muted-foreground">{t('panels.noAutomations')}</p>
				)}
			</CardContent>
		</Card>
	)
}
