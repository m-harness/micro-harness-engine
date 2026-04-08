import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useI18n } from '../../i18n/context.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import { api } from '../../lib/api.js'
import { DeletePolicyDialog } from '../../components/shared/DeletePolicyDialog.jsx'
import { McpBadge, McpStatusPill } from '../../components/shared/McpBadge.jsx'
import { RiskPill } from '../../components/shared/RiskPill.jsx'
import { StatusBadge } from '../../components/shared/StatusBadge.jsx'
import { Button } from '../../components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog.jsx'
import { Input } from '../../components/ui/input.jsx'

export default function ToolPoliciesPage() {
	const { t } = useI18n()
	const { data, loadAdmin, runAction, busyKey } = useAdmin()
	const toolPolicies = data?.toolPolicies || []
	const toolCatalog = data?.tools || []
	const mcpServers = data?.mcpServers || []
	const users = data?.users || []

	const [newPolicy, setNewPolicy] = useState({ name: '', description: '', tools: [] })
	const [createOpen, setCreateOpen] = useState(false)
	const [editor, setEditor] = useState(null)
	const [deleteTarget, setDeleteTarget] = useState(null)
	const [replacementId, setReplacementId] = useState(null)

	const toolPolicyUsage = new Map(toolPolicies.map(p => [p.id, users.filter(u => u.toolPolicy?.id === p.id).length]))
	const replacementRequired = deleteTarget ? (toolPolicyUsage.get(deleteTarget.id) || 0) > 0 : true

	function ToolCheckboxList({ tools, onChange }) {
		return (
			<div className="grid max-h-[24rem] gap-2 overflow-y-auto rounded-lg border p-4">
				{toolCatalog.map(tool => (
					<label className="flex items-start gap-3 text-sm" key={tool.name}>
						<input
							checked={tools.includes(tool.name)}
							onChange={e => onChange(e.target.checked ? [...tools, tool.name] : tools.filter(n => n !== tool.name))}
							type="checkbox"
							className="mt-1"
						/>
						<span>
							<span className="font-medium">{tool.name}</span>
							{tool.source === 'mcp' && <>{' '}<McpBadge /></>}
							{tool.source === 'mcp' && <>{' '}<McpStatusPill serverName={tool.mcpServerName} mcpServers={mcpServers} /></>}
							<span className="block text-xs text-muted-foreground">{tool.description}</span>
							<span className="mt-1 block"><RiskPill riskLevel={tool.riskLevel} /></span>
						</span>
					</label>
				))}
			</div>
		)
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">{t('admin.toolPolicies.title')}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{t('admin.toolPolicies.description')}</p>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>{t('admin.toolPolicies.policies')}</CardTitle>
							<CardDescription>{t('admin.toolPolicies.policiesDescription')}</CardDescription>
						</div>
						<Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />{t('admin.toolPolicies.createToolPolicy')}</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{toolPolicies.map(policy => (
						<div key={policy.id} className="rounded-lg border p-4">
							<div className="flex items-start justify-between gap-3">
								<div>
									<div className="text-sm font-semibold">{policy.name}</div>
									<div className="mt-1 text-xs text-muted-foreground">{policy.description || t('common.noDescription')}</div>
								</div>
								<div className="flex gap-2">
									<StatusBadge status={policy.isSystem ? 'pending' : 'default'}>{policy.isSystem ? t('common.system') : t('common.custom')}</StatusBadge>
									{!policy.isSystem && (
										<>
											<Button onClick={() => setEditor({ id: policy.id, name: policy.name, description: policy.description || '', tools: [...(policy.tools || [])] })} size="sm" variant="outline">{t('common.edit')}</Button>
											<Button onClick={() => { setDeleteTarget(policy); setReplacementId(null) }} size="sm" variant="outline">{t('common.delete')}</Button>
										</>
									)}
								</div>
							</div>
							<div className="mt-3 flex flex-wrap gap-2">
								{(policy.toolDetails || []).map(tool => (
									<span key={tool.name} className="inline-flex items-center gap-2 rounded-full bg-muted px-2 py-1 text-xs">
										{tool.name} <RiskPill riskLevel={tool.riskLevel} />
									</span>
								))}
							</div>
						</div>
					))}
				</CardContent>
			</Card>

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>{t('admin.toolPolicies.createToolPolicy')}</DialogTitle>
						<DialogDescription>{t('admin.toolPolicies.createDescription')}</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<Input onChange={e => setNewPolicy(c => ({ ...c, name: e.target.value }))} placeholder={t('common.policyName')} value={newPolicy.name} />
						<Input onChange={e => setNewPolicy(c => ({ ...c, description: e.target.value }))} placeholder={t('common.description')} value={newPolicy.description} />
						<ToolCheckboxList tools={newPolicy.tools} onChange={tools => setNewPolicy(c => ({ ...c, tools }))} />
						<Button className="w-full" onClick={() => runAction('create-tool-policy', async () => {
							await api.adminCreateToolPolicy(newPolicy)
							setNewPolicy({ name: '', description: '', tools: [] })
							setCreateOpen(false)
							await loadAdmin()
						})}>{t('admin.toolPolicies.createToolPolicy')}</Button>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={!!editor} onOpenChange={v => { if (!v) setEditor(null) }}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>{t('admin.toolPolicies.editToolPolicy')}</DialogTitle>
						<DialogDescription>{t('admin.toolPolicies.editDescription')}</DialogDescription>
					</DialogHeader>
					{editor && (
						<div className="space-y-4">
							<Input onChange={e => setEditor(c => ({ ...c, name: e.target.value }))} placeholder={t('common.policyName')} value={editor.name} />
							<Input onChange={e => setEditor(c => ({ ...c, description: e.target.value }))} placeholder={t('common.description')} value={editor.description} />
							<ToolCheckboxList tools={editor.tools} onChange={tools => setEditor(c => ({ ...c, tools }))} />
						</div>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={() => setEditor(null)}>{t('common.cancel')}</Button>
						<Button onClick={() => runAction(`update-tool-policy-${editor?.id}`, async () => {
							await api.adminUpdateToolPolicy(editor.id, { name: editor.name, description: editor.description, tools: editor.tools })
							setEditor(null)
							await loadAdmin()
						})}>{t('common.saveChanges')}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<DeletePolicyDialog
				open={!!deleteTarget}
				title={t('admin.toolPolicies.deleteToolPolicy')}
				description={t('admin.toolPolicies.deleteDescription')}
				policies={toolPolicies.filter(p => p.id !== deleteTarget?.id)}
				value={replacementId}
				replacementRequired={replacementRequired}
				replacementLabel={replacementRequired
					? t('admin.toolPolicies.replacementRequired')
					: t('admin.toolPolicies.noUsersAssigned')}
				onChange={setReplacementId}
				onCancel={() => { setDeleteTarget(null); setReplacementId(null) }}
				onConfirm={() => runAction(`delete-tool-policy-${deleteTarget?.id}`, async () => {
					await api.adminDeleteToolPolicy(deleteTarget.id, { replacementPolicyId: replacementId })
					setDeleteTarget(null); setReplacementId(null)
					await loadAdmin()
				})}
			/>
		</div>
	)
}
