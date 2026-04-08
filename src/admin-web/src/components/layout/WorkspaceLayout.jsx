import { Menu, Plus, LogOut } from 'lucide-react'
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import { useI18n } from '../../i18n/context.jsx'
import { useWorkspace } from '../../hooks/useWorkspace.js'
import { ConversationSidebar } from '../chat/ConversationSidebar.jsx'
import { LanguageToggle } from './LanguageToggle.jsx'
import { ThemeToggle } from './ThemeToggle.jsx'
import { Button } from '../ui/button.jsx'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet.jsx'
import { Separator } from '../ui/separator.jsx'
import { StatusBadge } from '../shared/StatusBadge.jsx'

function SidebarContent({ onSelect }) {
	const { authState, logout } = useAuth()
	const { t } = useI18n()
	const { conversationView, createConversation, busyKey } = useWorkspace()
	const activeRun = conversationView?.activeRun

	return (
		<div className="flex h-full flex-col">
			{/* Top: Brand + Logout */}
			<div className="flex items-center justify-between px-3 py-3">
				<div className="min-w-0">
					<div className="text-[10px] font-semibold uppercase tracking-widest text-primary">{t('app.brand')}</div>
					<div className="truncate text-sm font-semibold text-foreground">{authState.user?.displayName}</div>
				</div>
				<Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" title={t('layout.logOut')} onClick={logout} disabled={busyKey === 'logout'}>
					<LogOut className="h-4 w-4" />
				</Button>
			</div>

			<Separator />

			{/* Middle: Conversation list */}
			<div className="flex-1 overflow-hidden">
				<ConversationSidebar onSelect={onSelect} />
			</div>

			{/* Bottom: New chat + Controls */}
			<div className="px-3 pb-3 pt-2">
				<Button
					variant="outline"
					size="sm"
					className="mb-3 w-full justify-center gap-2"
					onClick={createConversation}
					disabled={busyKey === 'create-conversation'}
				>
					<Plus className="h-4 w-4" />
					{t('workspace.newConversation')}
				</Button>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1">
						<ThemeToggle />
						<LanguageToggle />
					</div>
					{activeRun?.status && activeRun.status !== 'ready' && (
						<StatusBadge status={activeRun.status} className="text-[10px]" />
					)}
				</div>
			</div>
		</div>
	)
}

export default function WorkspaceLayout() {
	const { t } = useI18n()
	const [sidebarOpen, setSidebarOpen] = useState(false)

	return (
		<div className="flex h-screen bg-background">
			{/* Desktop sidebar */}
			<aside className="hidden w-64 flex-shrink-0 border-r bg-card/50 lg:flex lg:flex-col">
				<SidebarContent />
			</aside>

			{/* Mobile: hamburger bar + sheet */}
			<div className="flex flex-1 flex-col overflow-hidden">
				<div className="flex items-center border-b px-3 py-2 lg:hidden">
					<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(true)}>
						<Menu className="h-5 w-5" />
					</Button>
				</div>

				<Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
					<SheetContent side="left" className="w-64 p-0">
						<SheetHeader className="sr-only">
							<SheetTitle>{t('layout.sessions')}</SheetTitle>
						</SheetHeader>
						<SidebarContent onSelect={() => setSidebarOpen(false)} />
					</SheetContent>
				</Sheet>

				<main className="flex flex-1 overflow-hidden">
					<Outlet />
				</main>
			</div>
		</div>
	)
}
