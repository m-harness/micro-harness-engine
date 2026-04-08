import { useI18n } from '../../i18n/context.jsx'
import { Button } from '../ui/button.jsx'
import {
	Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '../ui/dialog.jsx'

export function DeletePolicyDialog({
	open,
	title,
	description,
	policies,
	value,
	replacementRequired = true,
	replacementLabel = null,
	onChange,
	onCancel,
	onConfirm
}) {
	const { t } = useI18n()
	return (
		<Dialog open={open} onOpenChange={val => { if (!val) onCancel() }}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-2">
					{replacementRequired ? (
						<>
							{replacementLabel && <p className="text-sm text-muted-foreground">{replacementLabel}</p>}
							<select
								className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
								value={value ?? ''}
								onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
							>
								<option value="">{t('shared.chooseReplacement')}</option>
								{policies.map(policy => (
									<option key={policy.id} value={policy.id}>{policy.name}</option>
								))}
							</select>
						</>
					) : (
						<p className="text-sm text-muted-foreground">
							{replacementLabel || t('shared.noUsersCanDelete')}
						</p>
					)}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
					<Button disabled={replacementRequired && !value} variant="destructive" onClick={onConfirm}>
						{t('common.delete')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
