import { useState } from 'react'
import { useI18n } from '../../i18n/context.jsx'
import { useWorkspace } from '../../hooks/useWorkspace.js'
import { formatDate, formatInterval } from '../../lib/format.js'
import { StatusBadge } from '../shared/StatusBadge.jsx'
import { Button } from '../ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx'
import { Input } from '../ui/input.jsx'
import { Textarea } from '../ui/textarea.jsx'

export function AutomationsPanel({ automations }) {
	const { t } = useI18n()
	const { createAutomation, updateAutomationStatus, runAutomationNow, deleteAutomation, busyKey } = useWorkspace()
	const [form, setForm] = useState({ name: '', instruction: '', intervalMinutes: '60' })

	async function handleCreate(e) {
		e.preventDefault()
		await createAutomation(form)
		setForm({ name: '', instruction: '', intervalMinutes: '60' })
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t('panels.automationTitle')}</CardTitle>
				<CardDescription>{t('panels.automationDescription')}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<form className="space-y-3 rounded-lg border bg-muted/50 p-4" onSubmit={handleCreate}>
					<Input onChange={e => setForm(c => ({ ...c, name: e.target.value }))} placeholder={t('panels.automationName')} value={form.name} />
					<Textarea className="min-h-[6rem]" onChange={e => setForm(c => ({ ...c, instruction: e.target.value }))} placeholder={t('panels.automationInstruction')} value={form.instruction} />
					<div className="flex items-center gap-3">
						<Input className="w-28" min="5" type="number" onChange={e => setForm(c => ({ ...c, intervalMinutes: e.target.value }))} placeholder="60" value={form.intervalMinutes} />
						<span className="text-xs text-muted-foreground">{t('panels.minutes')}</span>
						<Button disabled={busyKey === 'create-automation'} type="submit" className="ml-auto">{t('common.create')}</Button>
					</div>
				</form>

				{automations.length > 0 ? automations.map(automation => (
					<div key={automation.id} className="rounded-lg border p-4">
						<div className="flex items-start justify-between gap-3">
							<div>
								<div className="text-sm font-semibold">{automation.name}</div>
								<div className="mt-1 text-xs text-muted-foreground">{formatInterval(automation.intervalMinutes)}</div>
							</div>
							<StatusBadge status={automation.status} />
						</div>
						<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{automation.instruction}</p>
						<div className="mt-2 text-xs text-muted-foreground">{t('panels.nextRun')} {formatDate(automation.nextRunAt)}</div>
						<div className="mt-3 flex flex-wrap gap-2">
							<Button disabled={busyKey === `run-${automation.id}`} onClick={() => runAutomationNow(automation.id)} size="sm" variant="secondary">{t('panels.runNow')}</Button>
							<Button disabled={busyKey === `automation-${automation.id}`} onClick={() => updateAutomationStatus(automation.id, automation.status === 'active' ? 'paused' : 'active')} size="sm" variant="outline">
								{automation.status === 'active' ? t('common.pause') : t('common.resume')}
							</Button>
							<Button disabled={busyKey === `delete-${automation.id}`} onClick={() => { if (window.confirm('Delete this automation?')) deleteAutomation(automation.id) }} size="sm" variant="destructive">{t('common.delete')}</Button>
						</div>
					</div>
				)) : (
					<p className="text-sm text-muted-foreground">{t('panels.noAutomations')}</p>
				)}
			</CardContent>
		</Card>
	)
}
