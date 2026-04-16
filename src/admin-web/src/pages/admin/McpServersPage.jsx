import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useI18n } from '../../i18n/context.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import { api } from '../../lib/api.js'
import { KeyValueEditor, kvPairsToObject } from '../../components/shared/KeyValueEditor.jsx'
import { StatusBadge } from '../../components/shared/StatusBadge.jsx'
import { Button } from '../../components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog.jsx'
import { Input } from '../../components/ui/input.jsx'
import { cn } from '../../lib/utils.js'

const MCP_NAME_RE = /^[a-zA-Z0-9@._/-]+$/

function mcpStateClass(state) {
	switch (state) {
		case 'ready': return 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
		case 'connecting': return 'border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
		case 'failed': return 'border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300'
		default: return 'border-border bg-muted text-muted-foreground'
	}
}

function buildConfig(form) {
	if (form.mode === 'stdio') {
		const config = { command: form.command }
		const args = form.args.split(',').map(s => s.trim()).filter(Boolean)
		if (args.length > 0) config.args = args
		const envObj = kvPairsToObject(form.env)
		if (Object.keys(envObj).length > 0) config.env = envObj
		return config
	}
	const config = { url: form.url }
	const headersObj = kvPairsToObject(form.headers)
	if (Object.keys(headersObj).length > 0) config.headers = headersObj
	return config
}

function validateForm(form, isCreate) {
	const errors = {}
	if (isCreate) {
		const name = form.name.trim()
		if (!name) {
			errors.name = 'Server name is required.'
		} else if (!MCP_NAME_RE.test(name)) {
			errors.name = 'Only alphanumeric characters, @, ., /, _, - are allowed (no spaces or Japanese characters).'
		}
	}
	if (form.mode === 'stdio') {
		if (!form.command.trim()) errors.command = 'Command is required.'
	} else {
		if (!form.url.trim()) errors.url = 'URL is required.'
	}
	return errors
}

function FieldError({ message }) {
	if (!message) return null
	return <p className="text-xs text-destructive">{message}</p>
}

export default function McpServersPage() {
	const { t } = useI18n()
	const { data, loadAdmin, pollUntilMcpSettled, runAction, busyKey } = useAdmin()
	const mcpServerConfigs = data?.mcpServerConfigs || []
	const [newServer, setNewServer] = useState({ name: '', mode: 'stdio', command: '', args: '', env: [], url: '', headers: [] })
	const [createOpen, setCreateOpen] = useState(false)
	const [editing, setEditing] = useState(null)
	const [createErrors, setCreateErrors] = useState({})
	const [editErrors, setEditErrors] = useState({})

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">{t('admin.mcpServers.title')}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{t('admin.mcpServers.description')}</p>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>{t('admin.mcpServers.servers')}</CardTitle>
						<Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />{t('admin.mcpServers.addServer')}</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{mcpServerConfigs.length === 0 && <p className="text-sm text-muted-foreground">{t('admin.mcpServers.noServers')}</p>}
					{mcpServerConfigs.map(server => {
						const isHttp = Boolean(server.config?.url)
						const isEditing = editing?.name === server.name
						return (
							<div key={server.name} className="rounded-lg border p-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<div className="flex items-center gap-2">
											<span className="text-sm font-semibold">{server.name}</span>
											<span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold', isHttp ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300' : 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300')}>
												{isHttp ? 'http' : 'stdio'}
											</span>
										</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{isHttp ? server.config.url : `${server.config.command || ''} ${(server.config.args || []).join(' ')}`.trim()}
										</div>
									</div>
									<div className="flex items-center gap-2">
										<span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold', mcpStateClass(server.state))}>
											{server.state}
										</span>
										<span className="text-xs text-muted-foreground">{t('admin.mcpServers.toolCount', { count: server.toolCount })}</span>
									</div>
								</div>
								{server.state === 'failed' && server.lastError && (
									<div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{server.lastError}</div>
								)}
								<div className="mt-3 flex flex-wrap gap-2">
									<Button onClick={() => {
										if (isEditing) { setEditing(null); setEditErrors({}); return }
										const cfg = server.config || {}
										setEditing({
											name: server.name, mode: cfg.url ? 'http' : 'stdio',
											command: cfg.command || '', args: (cfg.args || []).join(', '),
											env: [], url: cfg.url || '', headers: []
										})
										setEditErrors({})
									}} size="sm" variant="outline">{isEditing ? t('common.cancel') : t('common.edit')}</Button>
									<Button onClick={() => runAction(`reconnect-mcp-${server.name}`, async () => {
										await api.adminReconnectMcpServer(server.name)
										await loadAdmin()
										await pollUntilMcpSettled(server.name)
									})} size="sm" variant="outline">
										{busyKey === `reconnect-mcp-${server.name}` ? t('admin.mcpServers.connectingStatus') : t('admin.mcpServers.reconnect')}
									</Button>
									<Button onClick={() => runAction(`delete-mcp-${server.name}`, async () => {
										if (!window.confirm(`Delete MCP server "${server.name}"?`)) return
										await api.adminDeleteMcpServer(server.name)
										setEditing(null)
										await loadAdmin()
									})} size="sm" variant="destructive">{t('common.delete')}</Button>
								</div>
								{isEditing && (
									<div className="mt-4 space-y-3 rounded-lg border bg-muted/50 p-4">
										<div className="space-y-2">
											<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.mcpServers.mode')}</label>
											<select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" onChange={e => setEditing(c => ({ ...c, mode: e.target.value }))} value={editing.mode}>
												<option value="stdio">stdio</option>
												<option value="http">http</option>
											</select>
										</div>
										{editing.mode === 'stdio' ? (
											<>
												<div className="space-y-2">
													<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.mcpServers.command')}</label>
													<Input className={editErrors.command ? 'border-destructive' : ''} onChange={e => { setEditing(c => ({ ...c, command: e.target.value })); setEditErrors(c => ({ ...c, command: '' })) }} value={editing.command} />
													<FieldError message={editErrors.command} />
												</div>
												<div className="space-y-2">
													<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.mcpServers.argsCsv')}</label>
													<Input onChange={e => setEditing(c => ({ ...c, args: e.target.value }))} value={editing.args} />
												</div>
												<div className="space-y-2">
													<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.mcpServers.env')}</label>
													<KeyValueEditor keyPlaceholder="Variable" onChange={next => setEditing(c => ({ ...c, env: next }))} pairs={editing.env} valuePlaceholder="Value (secret)" />
												</div>
											</>
										) : (
											<>
												<div className="space-y-2">
													<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.mcpServers.url')}</label>
													<Input className={editErrors.url ? 'border-destructive' : ''} onChange={e => { setEditing(c => ({ ...c, url: e.target.value })); setEditErrors(c => ({ ...c, url: '' })) }} value={editing.url} />
													<FieldError message={editErrors.url} />
												</div>
												<div className="space-y-2">
													<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.mcpServers.headers')}</label>
													<KeyValueEditor keyPlaceholder="Header" onChange={next => setEditing(c => ({ ...c, headers: next }))} pairs={editing.headers} valuePlaceholder="Value (secret)" />
												</div>
											</>
										)}
										<Button onClick={() => {
											const errors = validateForm(editing, false)
											setEditErrors(errors)
											if (Object.keys(errors).length > 0) return
											runAction(`update-mcp-${server.name}`, async () => {
												await api.adminUpdateMcpServer(server.name, { config: buildConfig(editing) })
												setEditing(null)
												setEditErrors({})
												await loadAdmin()
												await pollUntilMcpSettled(server.name)
											})
										}}>{t('common.saveChanges')}</Button>
									</div>
								)}
							</div>
						)
					})}
				</CardContent>
			</Card>

			<Dialog open={createOpen} onOpenChange={open => { setCreateOpen(open); if (!open) setCreateErrors({}) }}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>{t('admin.mcpServers.addServer')}</DialogTitle>
						<DialogDescription>{t('admin.mcpServers.addDescription')}</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-2">
							<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('common.name')}</label>
							<Input className={createErrors.name ? 'border-destructive' : ''} onChange={e => { setNewServer(c => ({ ...c, name: e.target.value })); setCreateErrors(c => ({ ...c, name: '' })) }} placeholder="e.g. playwright-mcp" value={newServer.name} />
							<FieldError message={createErrors.name} />
						</div>
						<div className="space-y-2">
							<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.mcpServers.mode')}</label>
							<select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" onChange={e => setNewServer(c => ({ ...c, mode: e.target.value }))} value={newServer.mode}>
								<option value="stdio">{t('admin.mcpServers.stdioLocal')}</option>
								<option value="http">{t('admin.mcpServers.httpRemote')}</option>
							</select>
						</div>
						{newServer.mode === 'stdio' ? (
							<>
								<div className="space-y-2">
									<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.mcpServers.command')}</label>
									<Input className={createErrors.command ? 'border-destructive' : ''} onChange={e => { setNewServer(c => ({ ...c, command: e.target.value })); setCreateErrors(c => ({ ...c, command: '' })) }} placeholder="e.g. npx" value={newServer.command} />
									<FieldError message={createErrors.command} />
								</div>
								<div className="space-y-2">
									<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.mcpServers.argsCsv')}</label>
									<Input onChange={e => setNewServer(c => ({ ...c, args: e.target.value }))} placeholder="e.g. -y, @playwright/mcp@latest" value={newServer.args} />
								</div>
								<div className="space-y-2">
									<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.mcpServers.env')}</label>
									<KeyValueEditor keyPlaceholder="Variable" onChange={next => setNewServer(c => ({ ...c, env: next }))} pairs={newServer.env} valuePlaceholder="Value (secret)" />
								</div>
							</>
						) : (
							<>
								<div className="space-y-2">
									<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.mcpServers.url')}</label>
									<Input className={createErrors.url ? 'border-destructive' : ''} onChange={e => { setNewServer(c => ({ ...c, url: e.target.value })); setCreateErrors(c => ({ ...c, url: '' })) }} placeholder="e.g. http://localhost:3001/mcp" value={newServer.url} />
									<FieldError message={createErrors.url} />
								</div>
								<div className="space-y-2">
									<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.mcpServers.headers')}</label>
									<KeyValueEditor keyPlaceholder="Header" onChange={next => setNewServer(c => ({ ...c, headers: next }))} pairs={newServer.headers} valuePlaceholder="Value (secret)" />
								</div>
							</>
						)}
						<Button className="w-full" onClick={() => {
							const errors = validateForm(newServer, true)
							setCreateErrors(errors)
							if (Object.keys(errors).length > 0) return
							runAction('create-mcp-server', async () => {
								const serverName = newServer.name.trim()
								await api.adminCreateMcpServer({ name: serverName, config: buildConfig(newServer) })
								setNewServer({ name: '', mode: 'stdio', command: '', args: '', env: [], url: '', headers: [] })
								setCreateErrors({})
								setCreateOpen(false)
								await loadAdmin()
								await pollUntilMcpSettled(serverName)
							})
						}}>
							{busyKey === 'create-mcp-server' ? t('admin.mcpServers.connectingStatus') : t('admin.mcpServers.addServer')}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
