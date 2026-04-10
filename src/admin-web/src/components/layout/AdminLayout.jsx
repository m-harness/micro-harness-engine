import {
	BarChart3, Users, Shield, FolderLock, ShieldCheck,
	CheckSquare, Zap, Wrench, Sparkles, Server, LogOut, Menu
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useI18n } from '../../i18n/context.jsx'
import { cn } from '../../lib/utils.js'
import { LanguageToggle } from './LanguageToggle.jsx'
import { ThemeToggle } from './ThemeToggle.jsx'
import { Button } from '../ui/button.jsx'
import { ScrollArea } from '../ui/scroll-area.jsx'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet.jsx'

const NAV_ITEMS = [
	{ to: '/admin', icon: BarChart3, key: 'nav.overview', end: true },
	{ to: '/admin/users', icon: Users, key: 'nav.users' },
	{ to: '/admin/tool-policies', icon: Shield, key: 'nav.toolPolicies' },
	{ to: '/admin/file-policies', icon: FolderLock, key: 'nav.filePolicies' },
	{ to: '/admin/protection-rules', icon: ShieldCheck, key: 'nav.protectionRules' },
	{ to: '/admin/approvals', icon: CheckSquare, key: 'nav.approvals' },
	{ to: '/admin/automations', icon: Zap, key: 'nav.automations' },
	{ to: '/admin/tools', icon: Wrench, key: 'nav.tools' },
	{ to: '/admin/skills', icon: Sparkles, key: 'nav.skills' },
	{ to: '/admin/mcp-servers', icon: Server, key: 'nav.mcpServers' },
]

function SidebarNav({ onSelect }) {
	const { adminAuth, adminLogout } = useAdmin()
	const { t } = useI18n()

	return (
		<div className="flex h-full flex-col">
			<div className="border-b border-border/50 px-4 py-4">
				<div className="text-xs font-semibold uppercase tracking-wide text-primary">{t('layout.adminPlane')}</div>
				<h2 className="mt-1 text-base font-semibold">{t('app.brand')}</h2>
				{adminAuth.user && (
					<p className="mt-1 text-xs text-muted-foreground">@{adminAuth.user.loginName}</p>
				)}
			</div>

			<ScrollArea className="flex-1 px-2 py-2">
				<nav className="space-y-1">
					{NAV_ITEMS.map(item => (
						<NavLink
							key={item.to}
							to={item.to}
							end={item.end}
							onClick={onSelect}
							className={({ isActive }) => cn(
								'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
								isActive
									? 'bg-primary/10 text-primary border-l-2 border-primary'
									: 'text-muted-foreground hover:bg-muted hover:text-foreground'
							)}
						>
							<item.icon className="h-4 w-4 flex-shrink-0" />
							{t(item.key)}
						</NavLink>
					))}
				</nav>
			</ScrollArea>

			<div className="border-t border-border/50 px-4 py-3 space-y-3">
				<div className="flex items-center gap-2">
					<ThemeToggle />
					<LanguageToggle />
				</div>
				<Button variant="outline" size="sm" className="w-full" onClick={adminLogout}>
					<LogOut className="mr-2 h-4 w-4" />
					{t('layout.logOut')}
				</Button>
			</div>
		</div>
	)
}

export default function AdminLayout() {
	const [sidebarOpen, setSidebarOpen] = useState(false)
	const { t } = useI18n()
	const { data, loadAdmin } = useAdmin()

	useEffect(() => {
		if (!data) loadAdmin()
	}, [data, loadAdmin])

	return (
		<div className="flex h-screen bg-background">
			<aside className="hidden w-64 flex-shrink-0 border-r bg-background lg:block">
				<SidebarNav />
			</aside>

			<Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
				<SheetContent side="left" className="w-64 p-0">
					<SheetHeader className="sr-only">
						<SheetTitle>{t('layout.navigation')}</SheetTitle>
					</SheetHeader>
					<SidebarNav onSelect={() => setSidebarOpen(false)} />
				</SheetContent>
			</Sheet>

			<div className="flex flex-1 flex-col overflow-hidden">
				<header className="flex items-center border-b bg-background/80 backdrop-blur-md px-4 py-3 lg:hidden">
					<Button variant="ghost" size="sm" onClick={() => setSidebarOpen(true)}>
						<Menu className="h-5 w-5" />
					</Button>
					<span className="ml-3 text-sm font-semibold">{t('layout.adminHeader')}</span>
				</header>

				<main className="flex-1 overflow-y-auto p-4 lg:p-6">
					<Outlet />
				</main>
			</div>
		</div>
	)
}
