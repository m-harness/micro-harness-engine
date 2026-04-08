import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useI18n } from '../../i18n/context.jsx'
import { formatDate } from '../../lib/format.js'
import { cn } from '../../lib/utils.js'

export function MessageBubble({ message }) {
	const { t } = useI18n()
	const isUser = message.role === 'user'
	const isTool = message.role === 'tool'

	if (isTool) {
		return <ToolMessage message={message} t={t} />
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25 }}
			className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
		>
			<div className={cn(
				'max-w-[85%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[72%]',
				isUser
					? 'rounded-br-sm bg-primary text-primary-foreground'
					: 'rounded-bl-sm border bg-card shadow-sm'
			)}>
				<div className={cn(
					'mb-1 text-[11px] font-semibold uppercase tracking-wide',
					isUser ? 'opacity-70' : 'text-muted-foreground'
				)}>
					{isUser ? t('chat.you') : t('chat.agent')}
				</div>
				{isUser ? (
					<p className="whitespace-pre-wrap break-words text-sm leading-6">
						{message.contentText || t('chat.emptyMessage')}
					</p>
				) : (
					<div className="markdown-body text-sm leading-6">
						<ReactMarkdown remarkPlugins={[remarkGfm]}>
							{message.contentText || t('chat.emptyMessage')}
						</ReactMarkdown>
					</div>
				)}
				<div className={cn(
					'mt-2 text-[11px]',
					isUser ? 'opacity-70' : 'text-muted-foreground'
				)}>
					{formatDate(message.createdAt)}
				</div>
			</div>
		</motion.div>
	)
}

function ToolMessage({ message, t }) {
	const [expanded, setExpanded] = useState(false)
	const toolNameMatch = message.contentText?.match(/^\[Tool\]\s+(\S+?)\(/)
	const label = toolNameMatch
		? `🔧 ${toolNameMatch[1]}`
		: t('chat.toolCall')

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25 }}
			className="flex justify-center"
		>
			<div className="max-w-[90%] rounded-lg border border-dashed border-primary/30 bg-primary/5 shadow-sm">
				<button
					type="button"
					onClick={() => setExpanded(v => !v)}
					className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-xs text-foreground hover:bg-primary/10 transition-colors rounded-lg"
				>
					<span className="flex-1 truncate">{label}</span>
					{expanded
						? <ChevronUp className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
						: <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
					}
				</button>
				<AnimatePresence initial={false}>
					{expanded && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: 'auto', opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.2, ease: 'easeInOut' }}
							className="overflow-hidden"
						>
							<div className="border-t border-dashed border-primary/30 px-3 py-2 font-mono text-xs text-foreground whitespace-pre-wrap break-words">
								{message.contentText || t('chat.emptyMessage')}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</motion.div>
	)
}
