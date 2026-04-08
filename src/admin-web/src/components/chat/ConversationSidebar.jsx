import { useI18n } from '../../i18n/context.jsx'
import { useWorkspace } from '../../hooks/useWorkspace.js'
import { formatDate } from '../../lib/format.js'
import { cn } from '../../lib/utils.js'
import { ScrollArea } from '../ui/scroll-area.jsx'

export function ConversationSidebar({ onSelect }) {
	const { t } = useI18n()
	const { workspace, selectedConversationId, selectConversation } = useWorkspace()
	const conversations = workspace.conversations || []

	return (
		<ScrollArea className="h-full">
			<div className="space-y-0.5 p-2">
				{conversations.length === 0 ? (
					<p className="px-3 py-6 text-center text-sm text-muted-foreground">
						{t('sidebar.noConversations')}
					</p>
				) : conversations.map(conversation => (
					<button
						key={conversation.id}
						onClick={() => {
							selectConversation(conversation.id)
							onSelect?.()
						}}
						className={cn(
							'w-full rounded-md px-2.5 py-2 text-left transition-colors',
							selectedConversationId === conversation.id
								? 'bg-primary/10 text-primary'
								: 'hover:bg-muted'
						)}
						type="button"
					>
						<div className="flex items-center justify-between gap-1.5">
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium">{conversation.title}</div>
							</div>
							{conversation.pendingApprovalCount > 0 && (
								<span className={cn(
									'shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold',
									selectedConversationId === conversation.id
										? 'bg-primary/20 text-primary'
										: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100'
								)}>
									{conversation.pendingApprovalCount}
								</span>
							)}
						</div>
						<div className={cn(
							'mt-0.5 flex items-center gap-2 text-[11px]',
							selectedConversationId === conversation.id ? 'text-primary/70' : 'text-muted-foreground'
						)}>
							<span className="uppercase tracking-wide">{conversation.source}</span>
							<span>·</span>
							<span>{formatDate(conversation.lastMessageAt || conversation.createdAt)}</span>
							{conversation.activeRunStatus && <><span>·</span><span>{conversation.activeRunStatus}</span></>}
						</div>
					</button>
				))}
			</div>
		</ScrollArea>
	)
}
