import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useI18n } from '../../i18n/context.jsx'
import { ThemeToggle } from '../../components/layout/ThemeToggle.jsx'
import { LanguageToggle } from '../../components/layout/LanguageToggle.jsx'
import { Button } from '../../components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx'
import { Input } from '../../components/ui/input.jsx'

export default function AdminLoginPage() {
	const { t } = useI18n()
	const { adminAuth, loadAdmin, adminLogin, busyKey } = useAdmin()
	const [form, setForm] = useState({ loginName: 'root', password: '' })

	useEffect(() => { loadAdmin() }, [loadAdmin])

	async function handleSubmit(e) {
		e.preventDefault()
		try {
			await adminLogin(form)
			setForm(c => ({ ...c, password: '' }))
		} catch (error) {
			toast.error(error.message)
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4">
			<motion.div
				initial={{ opacity: 0, scale: 0.96 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.4, ease: 'easeOut' }}
				className="w-full max-w-lg"
			>
				<div className="mb-4 flex justify-end">
					<LanguageToggle />
					<ThemeToggle />
				</div>
				<Card className="border-none bg-gradient-to-br from-slate-900 to-indigo-950 text-slate-50 dark:from-slate-800 dark:to-indigo-900">
					<CardHeader>
						<CardTitle>{t('admin.login.title')}</CardTitle>
						<CardDescription className="text-slate-300">
							{t('admin.login.description')}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{!adminAuth.adminEnabled && (
							<div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
								{t('admin.login.noAdminMethod')}
							</div>
						)}
						<form className="space-y-4" onSubmit={handleSubmit}>
							<Input className="bg-white/10 border-white/20 text-slate-100 placeholder:text-slate-400 hover:border-white/30 focus-visible:ring-white/20 focus-visible:border-white/40" onChange={e => setForm(c => ({ ...c, loginName: e.target.value }))} placeholder={t('admin.login.adminUsername')} value={form.loginName} />
							<Input className="bg-white/10 border-white/20 text-slate-100 placeholder:text-slate-400 hover:border-white/30 focus-visible:ring-white/20 focus-visible:border-white/40" onChange={e => setForm(c => ({ ...c, password: e.target.value }))} placeholder={t('admin.login.password')} type="password" value={form.password} />
							<Button className="w-full" disabled={busyKey === 'admin-login' || !adminAuth.adminEnabled} type="submit">
								{busyKey === 'admin-login' ? t('admin.login.signingIn') : t('admin.login.enterConsole')}
							</Button>
						</form>
					</CardContent>
				</Card>
			</motion.div>
		</div>
	)
}
