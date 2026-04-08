import { motion } from 'framer-motion'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useI18n } from '../../i18n/context.jsx'
import { Card, CardContent } from '../../components/ui/card.jsx'
import { stagger } from '../../lib/motion.js'

const STAT_KEYS = [
	{ key: 'userCount', i18nKey: 'admin.overview.userCount' },
	{ key: 'pendingApprovalCount', i18nKey: 'admin.overview.pendingApprovalCount' },
	{ key: 'automationCount', i18nKey: 'admin.overview.automationCount' },
	{ key: 'toolPolicyCount', i18nKey: 'admin.overview.toolPolicyCount' },
	{ key: 'filePolicyCount', i18nKey: 'admin.overview.filePolicyCount' },
	{ key: 'protectionRuleCount', i18nKey: 'admin.overview.protectionRuleCount' },
	{ key: 'toolCatalogCount', i18nKey: 'admin.overview.toolCatalogCount' }
]

export default function OverviewPage() {
	const { data } = useAdmin()
	const { t } = useI18n()
	const overview = data?.overview || {}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">{t('admin.overview.title')}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{t('admin.overview.description')}</p>
			</div>
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{STAT_KEYS.map(({ key, i18nKey }, i) => (
					<motion.div key={key} {...stagger(i)}>
						<Card className="hover:shadow-panel-lg transition-shadow">
							<CardContent className="px-6 py-6">
								<div className="text-sm text-muted-foreground">{t(i18nKey)}</div>
								<div className="mt-2 text-4xl font-semibold">{overview[key] ?? 0}</div>
							</CardContent>
						</Card>
					</motion.div>
				))}
			</div>
		</div>
	)
}
