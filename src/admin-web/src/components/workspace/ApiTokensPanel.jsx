import { useState } from 'react'
import { useI18n } from '../../i18n/context.jsx'
import { useWorkspace } from '../../hooks/useWorkspace.js'
import { formatDate } from '../../lib/format.js'
import { Button } from '../ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx'
import { Input } from '../ui/input.jsx'

export function ApiTokensPanel() {
	const { t } = useI18n()
	const { workspace, revokeToken, createToken, busyKey } = useWorkspace()
	const [newTokenName, setNewTokenName] = useState('Primary integration token')
	const [revealedToken, setRevealedToken] = useState(null)

	async function handleCreate(e) {
		e.preventDefault()
		const result = await createToken(newTokenName)
		if (result) setRevealedToken(result)
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t('panels.apiTitle')}</CardTitle>
				<CardDescription>{t('panels.apiDescription')}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{revealedToken && (
					<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/50">
						<p className="font-semibold">{t('panels.copyToken')}</p>
						<pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100 dark:bg-slate-900">{revealedToken.token}</pre>
					</div>
				)}
				<form className="flex gap-3" onSubmit={handleCreate}>
					<Input onChange={e => setNewTokenName(e.target.value)} placeholder={t('panels.tokenName')} value={newTokenName} />
					<Button disabled={busyKey === 'create-token'} type="submit">{t('common.create')}</Button>
				</form>
				<div className="space-y-3">
					{workspace.apiTokens.length > 0 ? workspace.apiTokens.map(token => (
						<div key={token.id} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
							<div>
								<div className="text-sm font-semibold">{token.name}</div>
								<div className="mt-1 text-xs text-muted-foreground">
									{t('panels.created')} {formatDate(token.createdAt)} · {t('panels.lastUsed')} {formatDate(token.lastUsedAt)}
								</div>
							</div>
							<Button
								disabled={busyKey === `revoke-${token.id}`}
								onClick={() => { if (window.confirm('Revoke this token?')) revokeToken(token.id) }}
								size="sm"
								variant="outline"
							>
								{t('panels.revoke')}
							</Button>
						</div>
					)) : (
						<p className="text-sm text-muted-foreground">{t('panels.noTokens')}</p>
					)}
				</div>
			</CardContent>
		</Card>
	)
}
