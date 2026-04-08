import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useI18n } from '../../i18n/context.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import { api } from '../../lib/api.js'
import { Button } from '../../components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog.jsx'
import { Input } from '../../components/ui/input.jsx'
import { Textarea } from '../../components/ui/textarea.jsx'

export default function SkillsPage() {
	const { t } = useI18n()
	const { data, loadAdmin, runAction } = useAdmin()
	const skills = data?.skills || []
	const [newSkill, setNewSkill] = useState({ name: '', description: '', prompt: '' })
	const [createOpen, setCreateOpen] = useState(false)
	const [editing, setEditing] = useState(null)

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">{t('admin.skills.title')}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{t('admin.skills.description')}</p>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>{t('admin.skills.skillList')}</CardTitle>
						<Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />{t('admin.skills.createSkill')}</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{skills.length === 0 && <p className="text-sm text-muted-foreground">{t('admin.skills.noSkills')}</p>}
					{skills.map(skill => (
						<div key={skill.name} className="rounded-lg border p-4">
							<div className="flex items-start justify-between gap-3">
								<div>
									<div className="text-sm font-semibold">{skill.name}</div>
									<div className="mt-1 text-xs text-muted-foreground">{skill.description}</div>
								</div>
								<div className="flex gap-2">
									<Button onClick={() => setEditing({ name: skill.name, description: skill.description, prompt: skill.prompt })} size="sm" variant="outline">{t('common.edit')}</Button>
									<Button onClick={() => runAction(`delete-skill-${skill.name}`, async () => {
										if (!window.confirm(`Delete skill "${skill.name}"?`)) return
										await api.adminDeleteSkill(skill.name)
										setEditing(null)
										await loadAdmin()
									})} size="sm" variant="destructive">{t('common.delete')}</Button>
								</div>
							</div>
							{editing?.name === skill.name && (
								<div className="mt-4 space-y-3 rounded-lg border bg-muted/50 p-4">
									<div className="space-y-2">
										<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('common.description')}</label>
										<Input onChange={e => setEditing(c => ({ ...c, description: e.target.value }))} value={editing.description} />
									</div>
									<div className="space-y-2">
										<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.skills.prompt')}</label>
										<Textarea className="min-h-[12rem]" onChange={e => setEditing(c => ({ ...c, prompt: e.target.value }))} value={editing.prompt} />
									</div>
									<div className="flex gap-3">
										<Button onClick={() => runAction(`update-skill-${skill.name}`, async () => {
											await api.adminUpdateSkill(skill.name, { description: editing.description, prompt: editing.prompt })
											setEditing(null)
											await loadAdmin()
										})}>{t('common.save')}</Button>
										<Button onClick={() => setEditing(null)} variant="outline">{t('common.cancel')}</Button>
									</div>
								</div>
							)}
						</div>
					))}
				</CardContent>
			</Card>

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>{t('admin.skills.createSkill')}</DialogTitle>
						<DialogDescription>{t('admin.skills.createDescription')}</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-2">
							<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('common.name')}</label>
							<Input onChange={e => setNewSkill(c => ({ ...c, name: e.target.value }))} placeholder="e.g. code_review" value={newSkill.name} />
						</div>
						<div className="space-y-2">
							<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('common.description')}</label>
							<Input onChange={e => setNewSkill(c => ({ ...c, description: e.target.value }))} placeholder={t('admin.skills.shortDescription')} value={newSkill.description} />
						</div>
						<div className="space-y-2">
							<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.skills.prompt')}</label>
							<Textarea className="min-h-[14rem]" onChange={e => setNewSkill(c => ({ ...c, prompt: e.target.value }))} placeholder={t('admin.skills.instructions')} value={newSkill.prompt} />
						</div>
						<Button className="w-full" onClick={() => runAction('create-skill', async () => {
							await api.adminCreateSkill(newSkill)
							setNewSkill({ name: '', description: '', prompt: '' })
							setCreateOpen(false)
							await loadAdmin()
						})}>{t('admin.skills.createSkill')}</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
