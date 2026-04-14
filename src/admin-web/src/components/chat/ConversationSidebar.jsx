import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useI18n } from '../../i18n/context.jsx'
import { useWorkspace } from '../../hooks/useWorkspace.js'
import { formatDate } from '../../lib/format.js'
import { cn } from '../../lib/utils.js'
import { ScrollArea } from '../ui/scroll-area.jsx'

function ConversationItem({ conversation, isSelected, onSelect }) {
	return (
		<button
			onClick={onSelect}
			className={cn(
				'w-full rounded-md px-2.5 py-2 text-left transition-colors',
				isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
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
						isSelected
							? 'bg-primary/20 text-primary'
							: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100'
					)}>
						{conversation.pendingApprovalCount}
					</span>
				)}
			</div>
			<div className={cn(
				'mt-0.5 flex items-center gap-2 text-[11px]',
				isSelected ? 'text-primary/70' : 'text-muted-foreground'
			)}>
				<span className="uppercase tracking-wide">{conversation.source}</span>
				<span>·</span>
				<span>{formatDate(conversation.lastMessageAt || conversation.createdAt)}</span>
				{conversation.activeRunStatus && <><span>·</span><span>{conversation.activeRunStatus}</span></>}
			</div>
		</button>
	)
}

export function ConversationSidebar({ onSelect }) {
	const { t } = useI18n()
	const { workspace, selectedConversationId, selectConversation } = useWorkspace()
	const conversations = workspace.conversations || []
	const [autoOpen, setAutoOpen] = useState(false)

	const webConversations = conversations.filter(c => c.source !== 'automation')
	const autoConversations = conversations.filter(c => c.source === 'automation')

	return (
		<ScrollArea className="h-full">
			<div className="space-y-0.5 p-2">
				{conversations.length === 0 ? (
					<p className="px-3 py-6 text-center text-sm text-muted-foreground">
						{t('sidebar.noConversations')}
					</p>
				) : (
					<>
						{webConversations.map(conversation => (
							<ConversationItem
								key={conversation.id}
								conversation={conversation}
								isSelected={selectedConversationId === conversation.id}
								onSelect={() => { selectConversation(conversation.id); onSelect?.() }}
							/>
						))}

						{autoConversations.length > 0 && (
							<div className="pt-1">
								<button
									type="button"
									onClick={() => setAutoOpen(o => !o)}
									className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
								>
									<ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', autoOpen && 'rotate-90')} />
									<span>{t('sidebar.automations')}</span>
									<span className="ml-auto shrink-0 rounded-full bg-primary/15 text-primary px-1.5 py-px text-[10px] font-semibold">
										{autoConversations.length}
									</span>
								</button>

								{autoOpen && (
									<div className="mt-0.5 space-y-0.5 pl-2">
										{autoConversations.map(conversation => (
											<ConversationItem
												key={conversation.id}
												conversation={conversation}
												isSelected={selectedConversationId === conversation.id}
												onSelect={() => { selectConversation(conversation.id); onSelect?.() }}
											/>
										))}
									</div>
								)}
							</div>
						)}
					</>
				)}
			</div>
		</ScrollArea>
	)
}
