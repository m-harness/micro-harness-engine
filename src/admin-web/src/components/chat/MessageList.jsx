import { useEffect, useRef } from 'react'
import { useI18n } from '../../i18n/context.jsx'
import { MessageBubble } from './MessageBubble.jsx'
import { EmptyState } from '../shared/EmptyState.jsx'
import { ScrollArea } from '../ui/scroll-area.jsx'

const SCROLL_THRESHOLD = 50

export function MessageList({ messages, hasConversation }) {
	const { t } = useI18n()
	const bottomRef = useRef(null)
	const isAtBottomRef = useRef(true)

	const handleScroll = (e) => {
		const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
		isAtBottomRef.current = scrollHeight - scrollTop - clientHeight <= SCROLL_THRESHOLD
	}

	useEffect(() => {
		if (isAtBottomRef.current) {
			bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
		}
	}, [messages?.length])

	if (!hasConversation) {
		return (
			<div className="flex flex-1 items-center justify-center p-6">
				<EmptyState
					title={t('chat.noSession')}
					description={t('chat.noSessionDescription')}
				/>
			</div>
		)
	}

	if (!messages || messages.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-6">
				<EmptyState
					title={t('chat.readyTitle')}
					description={t('chat.readyDescription')}
				/>
			</div>
		)
	}

	return (
		<ScrollArea className="flex-1" onScroll={handleScroll}>
			<div className="mx-auto max-w-3xl space-y-5 px-4 py-4 lg:px-6">
				{messages.map(message => (
					<MessageBubble key={message.id} message={message} />
				))}
				<div ref={bottomRef} />
			</div>
		</ScrollArea>
	)
}
