import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useWorkspace } from '../../hooks/useWorkspace.js'
import { ChatInput } from '../../components/chat/ChatInput.jsx'
import { MessageList } from '../../components/chat/MessageList.jsx'
import { ApprovalsPanel } from '../../components/workspace/ApprovalsPanel.jsx'
import { AutomationsPanel } from '../../components/workspace/AutomationsPanel.jsx'
import { ApiTokensPanel } from '../../components/workspace/ApiTokensPanel.jsx'
import { ScrollArea } from '../../components/ui/scroll-area.jsx'
import { formatDate } from '../../lib/format.js'

export default function WorkspacePage() {
	const { conversationId } = useParams()
	const { conversationView, loadConversation, workspace } = useWorkspace()

	useEffect(() => {
		if (conversationId) {
			loadConversation(conversationId, workspace.conversations)
		}
	}, [conversationId])

	const messages = conversationView?.messages || []
	const approvals = conversationView?.approvals || []
	const automations = conversationView?.automations || []
	const activeRun = conversationView?.activeRun
	const lastFailedRun = conversationView?.lastFailedRun
	const conversation = conversationView?.conversation

	return (
		<div className="flex flex-1 overflow-hidden">
			<div className="flex flex-1 flex-col overflow-hidden">
				{conversation && (
					<div className="border-b px-4 py-1.5 lg:px-6">
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<span className="font-medium text-foreground">{conversation.title}</span>
							<span>·</span>
							<span className="uppercase tracking-wide">{conversation.source}</span>
							<span>·</span>
							<span>{formatDate(conversation.createdAt)}</span>
						</div>
					</div>
				)}
				<MessageList messages={messages} hasConversation={!!conversation} />
				<ChatInput activeRun={activeRun} lastFailedRun={lastFailedRun} />
			</div>

			{/* <aside className="hidden w-96 flex-shrink-0 border-l xl:block">
				<ScrollArea className="h-full">
					<div className="space-y-4 p-4">
						<ApprovalsPanel approvals={approvals} />
						<AutomationsPanel automations={automations} />
						<ApiTokensPanel />
					</div>
				</ScrollArea>
			</aside> */}
		</div>
	)
}
