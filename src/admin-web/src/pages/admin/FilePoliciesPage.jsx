import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useI18n } from '../../i18n/context.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import { api } from '../../lib/api.js'
import { DeletePolicyDialog } from '../../components/shared/DeletePolicyDialog.jsx'
import { FileBrowser } from '../../components/shared/FileBrowser.jsx'
import { StatusBadge } from '../../components/shared/StatusBadge.jsx'
import { Button } from '../../components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog.jsx'
import { Input } from '../../components/ui/input.jsx'

export default function FilePoliciesPage() {
	const { t } = useI18n()
	const { data, loadAdmin, runAction } = useAdmin()
	const filePolicies = data?.filePolicies || []
	const users = data?.users || []

	const [newPolicy, setNewPolicy] = useState({ name: '', description: '' })
	const [createOpen, setCreateOpen] = useState(false)
	const [probeOpen, setProbeOpen] = useState(false)
	const [editor, setEditor] = useState(null)
	const [newRoot, setNewRoot] = useState({})
	const [probePath, setProbePath] = useState('')
	const [probeResult, setProbeResult] = useState(null)
	const [browserPolicyId, setBrowserPolicyId] = useState(null)
	const [browserData, setBrowserData] = useState(null)
	const [deleteTarget, setDeleteTarget] = useState(null)
	const [replacementId, setReplacementId] = useState(null)

	const filePolicyUsage = new Map(filePolicies.map(p => [p.id, users.filter(u => u.filePolicy?.id === p.id).length]))
	const replacementRequired = deleteTarget ? (filePolicyUsage.get(deleteTarget.id) || 0) > 0 : true

	async function openBrowser(policyId) {
		setBrowserPolicyId(policyId)
		setBrowserData(await api.adminBrowseFileSystem())
	}

	async function handleAddRootFromBrowser(policyId, absolutePath, pathType) {
		const selectedNode = browserData?.nodes?.find(n => n.absolutePath === absolutePath)
		const scope = selectedNode?.isWorkspace ? 'workspace' : 'absolute'
		const rootPath = selectedNode?.isWorkspace ? (selectedNode.workspaceRelativePath || '.') : absolutePath
		await api.adminAddFilePolicyRoot(policyId, { scope, rootPath, pathType })
		setBrowserPolicyId(null)
		setBrowserData(null)
		await loadAdmin()
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">{t('admin.filePolicies.title')}</h1>
					<p className="mt-1 text-sm text-muted-foreground">{t('admin.filePolicies.description')}</p>
				</div>
				<Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />{t('admin.filePolicies.createFilePolicy')}</Button>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>{t('admin.filePolicies.policies')}</CardTitle>
						<Button onClick={() => setProbeOpen(true)} variant="outline"><Search className="mr-2 h-4 w-4" />{t('admin.filePolicies.probePath')}</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{filePolicies.map(policy => (
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
											<Button onClick={() => setEditor({ id: policy.id, name: policy.name, description: policy.description || '' })} size="sm" variant="outline">{t('common.edit')}</Button>
											<Button onClick={() => { setDeleteTarget(policy); setReplacementId(null) }} size="sm" variant="outline">{t('common.delete')}</Button>
										</>
									)}
								</div>
							</div>
							<div className="mt-4 space-y-2">
								{policy.roots.map(root => (
									<div key={root.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/50 px-3 py-2 text-xs">
										<span>{root.scope}:{root.pathType}:{root.rootPath}</span>
										{!policy.isSystem && (
											<Button onClick={() => runAction(`delete-root-${root.id}`, async () => {
												await api.adminDeleteFilePolicyRoot(policy.id, root.id)
												await loadAdmin()
											})} size="sm" variant="outline">{t('common.delete')}</Button>
										)}
									</div>
								))}
							</div>
							{!policy.isSystem && (
								<div className="mt-4 flex flex-wrap items-center gap-2">
									<Input className="flex-1" onChange={e => setNewRoot(c => ({ ...c, [policy.id]: { ...(c[policy.id] || {}), rootPath: e.target.value } }))} placeholder={t('admin.filePolicies.rootPath')} value={newRoot[policy.id]?.rootPath || ''} />
									<select className="h-10 rounded-lg border border-input bg-background px-3 text-sm" onChange={e => setNewRoot(c => ({ ...c, [policy.id]: { ...(c[policy.id] || {}), pathType: e.target.value } }))} value={newRoot[policy.id]?.pathType || 'dir'}>
										<option value="dir">dir</option>
										<option value="file">file</option>
									</select>
									<Button onClick={() => runAction(`open-browser-${policy.id}`, () => openBrowser(policy.id))} variant="outline" size="sm">{t('admin.filePolicies.browse')}</Button>
									<Button onClick={() => runAction(`add-root-${policy.id}`, async () => {
										await api.adminAddFilePolicyRoot(policy.id, { scope: 'absolute', rootPath: newRoot[policy.id]?.rootPath || '', pathType: newRoot[policy.id]?.pathType || 'dir' })
										setNewRoot(c => ({ ...c, [policy.id]: { rootPath: '', pathType: 'dir' } }))
										await loadAdmin()
									})} size="sm">{t('admin.filePolicies.addRoot')}</Button>
								</div>
							)}
						</div>
					))}
				</CardContent>
			</Card>

			<Dialog open={probeOpen} onOpenChange={setProbeOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('admin.filePolicies.probePath')}</DialogTitle>
						<DialogDescription>{t('admin.filePolicies.probeDescription')}</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<Input onChange={e => setProbePath(e.target.value)} placeholder="C:\\Shared\\Docs or ./docs" value={probePath} />
						<Button onClick={() => runAction('probe-path', async () => { setProbeResult(await api.adminProbePath(probePath)) })} variant="outline">{t('admin.filePolicies.probe')}</Button>
						{probeResult && (
							<div className="space-y-3 rounded-lg border p-4 text-sm">
								<div className="flex flex-wrap gap-2">
									<StatusBadge status={probeResult.exists ? 'active' : 'denied'}>{probeResult.exists ? t('admin.filePolicies.visibleToServer') : t('admin.filePolicies.notFound')}</StatusBadge>
									{probeResult.isWorkspace ? <StatusBadge status="pending">{t('admin.filePolicies.insideWorkspace')}</StatusBadge> : <StatusBadge status="default">{t('admin.filePolicies.outsideWorkspace')}</StatusBadge>}
									{probeResult.pathType && <StatusBadge status="default">{probeResult.pathType}</StatusBadge>}
								</div>
								<p><span className="font-semibold">{t('admin.filePolicies.resolved')}</span> {probeResult.absolutePath}</p>
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('admin.filePolicies.createDialogTitle')}</DialogTitle>
						<DialogDescription>{t('admin.filePolicies.createDialogDescription')}</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<Input onChange={e => setNewPolicy(c => ({ ...c, name: e.target.value }))} placeholder={t('common.policyName')} value={newPolicy.name} />
						<Input onChange={e => setNewPolicy(c => ({ ...c, description: e.target.value }))} placeholder={t('common.description')} value={newPolicy.description} />
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
						<Button onClick={() => runAction('create-file-policy', async () => {
							await api.adminCreateFilePolicy(newPolicy)
							setNewPolicy({ name: '', description: '' })
							setCreateOpen(false)
							await loadAdmin()
						})}>{t('common.create')}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={!!editor} onOpenChange={v => { if (!v) setEditor(null) }}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('admin.filePolicies.editDialogTitle')}</DialogTitle>
						<DialogDescription>{t('admin.filePolicies.editDialogDescription')}</DialogDescription>
					</DialogHeader>
					{editor && (
						<div className="space-y-4">
							<Input onChange={e => setEditor(c => ({ ...c, name: e.target.value }))} placeholder={t('common.policyName')} value={editor.name} />
							<Input onChange={e => setEditor(c => ({ ...c, description: e.target.value }))} placeholder={t('common.description')} value={editor.description} />
						</div>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={() => setEditor(null)}>{t('common.cancel')}</Button>
						<Button onClick={() => runAction(`update-file-policy-${editor?.id}`, async () => {
							await api.adminUpdateFilePolicy(editor.id, { name: editor.name, description: editor.description })
							setEditor(null)
							await loadAdmin()
						})}>{t('common.save')}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={!!browserPolicyId} onOpenChange={v => { if (!v) { setBrowserPolicyId(null); setBrowserData(null) } }}>
				<DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
					<DialogHeader>
						<DialogTitle>{t('admin.filePolicies.selectPath')}</DialogTitle>
						<DialogDescription>{t('admin.filePolicies.selectPathDescription')}</DialogDescription>
					</DialogHeader>
					<div className="max-h-[72vh] overflow-y-auto">
						<FileBrowser
							data={browserData}
							onBrowse={async path => { const next = await api.adminBrowseFileSystem(path); setBrowserData(next); return next }}
							onAddRoot={async (absolutePath, pathType) => {
								await runAction(`browser-add-root-${browserPolicyId}`, () => handleAddRootFromBrowser(browserPolicyId, absolutePath, pathType))
							}}
						/>
					</div>
				</DialogContent>
			</Dialog>

			<DeletePolicyDialog
				open={!!deleteTarget}
				title={t('admin.filePolicies.deleteTitle')}
				description={t('admin.filePolicies.deleteDescription')}
				policies={filePolicies.filter(p => p.id !== deleteTarget?.id)}
				value={replacementId}
				replacementRequired={replacementRequired}
				replacementLabel={replacementRequired ? t('admin.filePolicies.replacementRequired') : t('admin.filePolicies.noUsersAssigned')}
				onChange={setReplacementId}
				onCancel={() => { setDeleteTarget(null); setReplacementId(null) }}
				onConfirm={() => runAction(`delete-file-policy-${deleteTarget?.id}`, async () => {
					await api.adminDeleteFilePolicy(deleteTarget.id, { replacementPolicyId: replacementId })
					setDeleteTarget(null); setReplacementId(null)
					await loadAdmin()
				})}
			/>
		</div>
	)
}
