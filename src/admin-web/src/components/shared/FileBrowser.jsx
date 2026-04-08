import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/context.jsx'
import { Badge } from '../ui/badge.jsx'
import { Button } from '../ui/button.jsx'

export function FileBrowser({ data, onBrowse, onAddRoot }) {
	const { t } = useI18n()
	const [browser, setBrowser] = useState(data)

	useEffect(() => { setBrowser(data) }, [data])

	const openPath = async targetPath => {
		const next = await onBrowse(targetPath)
		setBrowser(next)
	}

	const nodes = browser?.nodes || []

	return (
		<div className="space-y-4">
			<div className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
				<span className="font-semibold">{t('shared.currentPath')}</span>{' '}
				{browser?.currentPath || t('browser.roots')}
			</div>
			<div className="grid gap-3">
				{nodes.map(node => (
					<div key={`${node.absolutePath}-${node.kind}`} className="rounded-lg border bg-card px-4 py-4">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<div className="flex flex-wrap items-center gap-2">
									<p className="font-semibold">{node.name}</p>
									<Badge>{node.kind}</Badge>
									{node.isWorkspace && <Badge tone="success">workspace</Badge>}
								</div>
								<p className="mt-1 break-all text-xs text-muted-foreground">{node.absolutePath}</p>
							</div>
							<div className="flex flex-wrap gap-2">
								{node.kind === 'dir' && (
									<Button variant="outline" size="sm" onClick={() => openPath(node.absolutePath)}>{t('browser.open')}</Button>
								)}
								{node.kind === 'file' && (
									<Button variant="outline" size="sm" onClick={() => onAddRoot(node.absolutePath, 'file')}>{t('shared.useFile')}</Button>
								)}
								{node.kind === 'dir' && (
									<Button size="sm" onClick={() => onAddRoot(node.absolutePath, 'dir')}>{t('shared.useFolder')}</Button>
								)}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
