import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useI18n } from '../../i18n/context.jsx'
import { api } from '../../lib/api.js'
import { StatusBadge } from '../../components/shared/StatusBadge.jsx'
import { Button } from '../../components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog.jsx'
import { Input } from '../../components/ui/input.jsx'

const ROOT_SYSTEM_USER_TYPE = 'root'
function isRootUser(user) { return user?.systemUserType === ROOT_SYSTEM_USER_TYPE }

export default function UsersPage() {
	const { data, loadAdmin, runAction, busyKey } = useAdmin()
	const { t } = useI18n()
	const users = data?.users || []
	const toolPolicies = data?.toolPolicies || []
	const filePolicies = data?.filePolicies || []
	const [newUser, setNewUser] = useState({ loginName: '', displayName: '', password: '', role: 'user' })
	const [createOpen, setCreateOpen] = useState(false)
	const [passwordDrafts, setPasswordDrafts] = useState({})

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">{t('admin.users.title')}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{t('admin.users.description')}</p>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>{t('admin.users.userList')}</CardTitle>
							<CardDescription>{t('admin.users.userListDescription')}</CardDescription>
						</div>
						<Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />{t('admin.users.createUser')}</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{users.map(user => {
						const root = isRootUser(user)
						const canDelete = !root && user.authSource === 'local'
						return (
							<div key={user.id} className="rounded-lg border p-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<div className="text-sm font-semibold">{user.displayName}</div>
										<div className="mt-1 text-xs text-muted-foreground">@{user.loginName}</div>
									</div>
									<div className="flex flex-wrap gap-2">
										<StatusBadge status={user.status} />
										<StatusBadge status={user.role === 'admin' ? 'active' : 'default'}>{user.role}</StatusBadge>
										{root && <StatusBadge status="pending">{t('admin.users.protectedRoot')}</StatusBadge>}
									</div>
								</div>
								<div className="mt-4 grid gap-3 md:grid-cols-2">
									<div className="space-y-2">
										<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.users.toolPolicy')}</label>
										<select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" onChange={e => runAction(`assign-tool-${user.id}`, async () => {
											await api.adminAssignPolicies(user.id, { toolPolicyId: e.target.value, filePolicyId: user.filePolicy.id })
											await loadAdmin()
										})} value={user.toolPolicy?.id || ''}>
											{toolPolicies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
										</select>
									</div>
									<div className="space-y-2">
										<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.users.filePolicy')}</label>
										<select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" onChange={e => runAction(`assign-file-${user.id}`, async () => {
											await api.adminAssignPolicies(user.id, { toolPolicyId: user.toolPolicy.id, filePolicyId: e.target.value })
											await loadAdmin()
										})} value={user.filePolicy?.id || ''}>
											{filePolicies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
										</select>
									</div>
								</div>
								<div className="mt-4 flex flex-wrap items-center gap-2">
									<Input className="flex-1" disabled={root} onChange={e => setPasswordDrafts(c => ({ ...c, [user.id]: e.target.value }))} placeholder={root ? t('admin.users.managedByEnv') : t('admin.users.newPassword')} type="password" value={passwordDrafts[user.id] || ''} />
									<Button disabled={root} onClick={() => runAction(`password-${user.id}`, async () => {
										await api.adminSetUserPassword(user.id, { password: passwordDrafts[user.id] || '' })
										setPasswordDrafts(c => ({ ...c, [user.id]: '' }))
									})} variant="outline" size="sm">{t('admin.users.setPassword')}</Button>
									<Button disabled={root} onClick={() => runAction(`status-${user.id}`, async () => {
										await api.adminUpdateUser(user.id, { loginName: user.loginName, displayName: user.displayName, role: user.role, status: user.status === 'active' ? 'disabled' : 'active' })
										await loadAdmin()
									})} variant="outline" size="sm">{user.status === 'active' ? t('common.disable') : t('common.enable')}</Button>
									<Button disabled={!canDelete} onClick={() => runAction(`delete-user-${user.id}`, async () => {
										if (!window.confirm(`Delete ${user.loginName}?`)) return
										await api.adminDeleteUser(user.id)
										await loadAdmin()
									})} variant="destructive" size="sm">{t('common.delete')}</Button>
								</div>
								{root && <p className="mt-3 text-xs text-muted-foreground">{t('admin.users.rootNote')}</p>}
							</div>
						)
					})}
				</CardContent>
			</Card>

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('admin.users.createUser')}</DialogTitle>
						<DialogDescription>{t('admin.users.createDescription')}</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<Input onChange={e => setNewUser(c => ({ ...c, loginName: e.target.value }))} placeholder={t('admin.users.loginName')} value={newUser.loginName} />
						<Input onChange={e => setNewUser(c => ({ ...c, displayName: e.target.value }))} placeholder={t('admin.users.displayName')} value={newUser.displayName} />
						<Input onChange={e => setNewUser(c => ({ ...c, password: e.target.value }))} placeholder={t('admin.users.initialPassword')} type="password" value={newUser.password} />
						<select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" onChange={e => setNewUser(c => ({ ...c, role: e.target.value }))} value={newUser.role}>
							<option value="user">user</option>
							<option value="admin">admin</option>
						</select>
						<Button className="w-full" onClick={() => runAction('create-user', async () => {
							await api.adminCreateUser(newUser)
							setNewUser({ loginName: '', displayName: '', password: '', role: 'user' })
							setCreateOpen(false)
							await loadAdmin()
						})}>{t('admin.users.createUser')}</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
