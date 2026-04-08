import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useI18n } from '../../i18n/context.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import { api } from '../../lib/api.js'
import { StatusBadge } from '../../components/shared/StatusBadge.jsx'
import { Button } from '../../components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog.jsx'
import { Input } from '../../components/ui/input.jsx'

export default function ProtectionRulesPage() {
	const { t } = useI18n()
	const { data, loadAdmin, runAction } = useAdmin()
	const protectionRules = data?.protectionRules || []
	const [newRule, setNewRule] = useState({ kind: 'path', pattern: '' })
	const [createOpen, setCreateOpen] = useState(false)
	const [inspectOpen, setInspectOpen] = useState(false)
	const [inspectPath, setInspectPath] = useState('')
	const [inspectResult, setInspectResult] = useState(null)

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">{t('admin.protectionRules.title')}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{t('admin.protectionRules.description')}</p>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>{t('admin.protectionRules.rules')}</CardTitle>
						<div className="flex gap-2">
							<Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />{t('admin.protectionRules.addRule')}</Button>
							<Button onClick={() => setInspectOpen(true)} variant="outline"><Search className="mr-2 h-4 w-4" />{t('admin.protectionRules.inspectPath')}</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
						<span className="font-semibold">{t('admin.protectionRules.noteLabel')}</span> {t('admin.protectionRules.noteText')}
					</div>
					{protectionRules.map(rule => {
						const isSystem = rule.scope === 'system'
						return (
							<div key={rule.id} className="rounded-lg border p-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<div className="text-sm font-semibold font-mono">{rule.pattern}</div>
										{rule.note && <div className="mt-1 text-xs text-muted-foreground">{rule.note}</div>}
									</div>
									<div className="flex flex-wrap gap-2">
										<StatusBadge status="default">{rule.patternType}</StatusBadge>
										{isSystem && <StatusBadge status="pending">{rule.scope}</StatusBadge>}
										<StatusBadge status={rule.enabled ? 'denied' : 'disabled'}>
											{rule.enabled ? t('common.deny') : t('common.disabled')}
										</StatusBadge>
									</div>
								</div>
								<div className="mt-4 flex gap-3">
									<Button onClick={() => runAction(`toggle-protection-${rule.id}`, async () => {
										await api.adminToggleProtectionRule(rule.id, { enabled: !rule.enabled })
										await loadAdmin()
									})} size="sm" variant="outline">{rule.enabled ? t('common.disable') : t('common.enable')}</Button>
									{!isSystem && (
										<Button onClick={() => runAction(`delete-protection-${rule.id}`, async () => {
											if (!window.confirm(`Delete protection rule for "${rule.pattern}"?`)) return
											await api.adminDeleteProtectionRule(rule.id)
											await loadAdmin()
										})} size="sm" variant="destructive">{t('common.delete')}</Button>
									)}
								</div>
							</div>
						)
					})}
					{protectionRules.length === 0 && <p className="text-sm text-muted-foreground">{t('admin.protectionRules.noRules')}</p>}
				</CardContent>
			</Card>

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('admin.protectionRules.addRule')}</DialogTitle>
						<DialogDescription>{t('admin.protectionRules.addRuleDescription')}</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-2">
							<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.protectionRules.type')}</label>
							<select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" onChange={e => setNewRule(c => ({ ...c, kind: e.target.value }))} value={newRule.kind}>
								<option value="path">{t('admin.protectionRules.fileExact')}</option>
								<option value="dir">{t('admin.protectionRules.folderTree')}</option>
								<option value="glob">{t('admin.protectionRules.patternWild')}</option>
							</select>
						</div>
						<div className="space-y-2">
							<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.protectionRules.pattern')}</label>
							<Input onChange={e => setNewRule(c => ({ ...c, pattern: e.target.value }))} placeholder={newRule.kind === 'path' ? 'e.g. .env' : newRule.kind === 'dir' ? 'e.g. security/' : 'e.g. *.secret'} value={newRule.pattern} />
						</div>
						<Button className="w-full" onClick={() => runAction('create-protection-rule', async () => {
							await api.adminCreateProtectionRule({ kind: newRule.kind, pattern: newRule.pattern })
							setNewRule({ kind: 'path', pattern: '' })
							setCreateOpen(false)
							await loadAdmin()
						})}>{t('admin.protectionRules.createRule')}</Button>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={inspectOpen} onOpenChange={setInspectOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('admin.protectionRules.inspectPath')}</DialogTitle>
						<DialogDescription>{t('admin.protectionRules.inspectDescription')}</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<Input onChange={e => setInspectPath(e.target.value)} placeholder="e.g. .env or src/secrets.json" value={inspectPath} />
						<Button onClick={() => runAction('inspect-protection', async () => {
							setInspectResult(await api.adminInspectProtectionPath({ path: inspectPath }))
						})} variant="outline">{t('admin.protectionRules.inspect')}</Button>
						{inspectResult && (
							<div className="space-y-3 rounded-lg border p-4">
								<div className="text-xs text-muted-foreground">{t('admin.protectionRules.pathLabel')} <span className="font-mono font-semibold text-foreground">{inspectResult.path}</span></div>
								<StatusBadge status={inspectResult.protected ? 'denied' : 'active'}>
									{inspectResult.protected ? t('admin.protectionRules.isProtected') : t('admin.protectionRules.notProtected')}
								</StatusBadge>
								{inspectResult.pattern && (
									<div className="text-xs text-muted-foreground">{t('admin.protectionRules.matchedRule')} <span className="font-mono">{inspectResult.pattern}</span></div>
								)}
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
