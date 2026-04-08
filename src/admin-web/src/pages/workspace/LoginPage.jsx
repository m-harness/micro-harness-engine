import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { ShieldCheck, Users, Blocks, Lock } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth.js'
import { useI18n } from '../../i18n/context.jsx'
import { Button } from '../../components/ui/button.jsx'
import { Input } from '../../components/ui/input.jsx'
import { ThemeToggle } from '../../components/layout/ThemeToggle.jsx'
import { LanguageToggle } from '../../components/layout/LanguageToggle.jsx'

export default function LoginPage() {
	const { t } = useI18n()
	const { login } = useAuth()
	const navigate = useNavigate()
	const [form, setForm] = useState({ loginName: '', password: '' })
	const [busy, setBusy] = useState(false)

	async function handleSubmit(e) {
		e.preventDefault()
		setBusy(true)
		try {
			await login(form)
			navigate('/')
		} catch (error) {
			toast.error(error.message)
		} finally {
			setBusy(false)
		}
	}

	const features = [
		{ icon: Lock, title: t('workspaceLogin.feat1'), desc: t('workspaceLogin.feat1desc') },
		{ icon: Users, title: t('workspaceLogin.feat2'), desc: t('workspaceLogin.feat2desc') },
		{ icon: ShieldCheck, title: t('workspaceLogin.feat3'), desc: t('workspaceLogin.feat3desc') },
		{ icon: Blocks, title: t('workspaceLogin.feat4'), desc: t('workspaceLogin.feat4desc') },
	]

	return (
		<div className="login-bg relative flex min-h-screen items-center justify-center overflow-hidden p-4">
			{/* Animated gradient blobs */}
			<div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
				<div className="login-blob login-blob-1" />
				<div className="login-blob login-blob-2" />
				<div className="login-blob login-blob-3" />
			</div>

			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5, ease: 'easeOut' }}
				className="relative z-10 w-full max-w-5xl"
			>
				<div className="mb-4 flex justify-end gap-1">
					<LanguageToggle />
					<ThemeToggle />
				</div>

				<div className="grid min-h-[480px] overflow-hidden rounded-2xl shadow-2xl shadow-indigo-500/10 lg:grid-cols-[1.2fr_0.8fr]">
					{/* Left: Service overview */}
					<div className="flex flex-col justify-between bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-10 py-10 text-white">
						<div>
							<div className="text-xs font-semibold uppercase tracking-widest text-indigo-400">{t('app.brand')}</div>
							<h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight lg:text-4xl">
								{t('workspaceLogin.heroTitle')}
							</h1>
							<p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-300">
								{t('workspaceLogin.heroDescription')}
							</p>
						</div>

						<div className="mt-8 grid grid-cols-2 gap-3">
							{features.map(({ icon: Icon, title, desc }) => (
								<div key={title} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
									<div className="flex items-center gap-2">
										<Icon className="h-4 w-4 text-indigo-400" />
										<span className="text-sm font-semibold">{title}</span>
									</div>
									<p className="mt-1 text-xs leading-relaxed text-slate-400">{desc}</p>
								</div>
							))}
						</div>
					</div>

					{/* Right: Sign-in form */}
					<div className="flex flex-col justify-center bg-card px-10 py-10">
						<h2 className="text-2xl font-bold tracking-tight text-card-foreground">{t('common.signIn')}</h2>
						<p className="mt-1 text-sm text-muted-foreground">{t('workspaceLogin.signInDescription')}</p>

						<form className="mt-8 space-y-5" onSubmit={handleSubmit}>
							<div className="space-y-1.5">
								<label htmlFor="loginName" className="text-xs font-medium text-muted-foreground">{t('workspaceLogin.username')}</label>
								<Input id="loginName" name="loginName" onChange={e => setForm(c => ({ ...c, loginName: e.target.value }))} value={form.loginName} />
							</div>
							<div className="space-y-1.5">
								<label htmlFor="password" className="text-xs font-medium text-muted-foreground">{t('workspaceLogin.password')}</label>
								<Input id="password" name="password" onChange={e => setForm(c => ({ ...c, password: e.target.value }))} type="password" value={form.password} />
							</div>
							<Button className="w-full" disabled={busy} type="submit">
								{busy ? t('workspaceLogin.signingIn') : t('common.signIn')}
							</Button>
						</form>
					</div>
				</div>
			</motion.div>
		</div>
	)
}
