import { Loader2, Send } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '../../i18n/context.jsx'
import { useWorkspace } from '../../hooks/useWorkspace.js'
import { StatusBadge } from '../shared/StatusBadge.jsx'
import { Button } from '../ui/button.jsx'
import { Textarea } from '../ui/textarea.jsx'

export function ChatInput({ activeRun, lastFailedRun }) {
	const { t } = useI18n()
	const [messageDraft, setMessageDraft] = useState('')
	const { sendMessage, busyKey } = useWorkspace()
	const isSending = busyKey === 'send-message'

	function handleSubmit(e) {
		e.preventDefault()
		if (!messageDraft.trim()) return
		sendMessage(messageDraft)
		setMessageDraft('')
	}

	function handleKeyDown(e) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault()
			handleSubmit(e)
		}
	}

	return (
		<div className="border-t bg-background/80 backdrop-blur-md px-4 py-4 lg:px-6">
			{activeRun && (
				<div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2">
					<StatusBadge status={activeRun.status} />
					<span className="text-sm text-muted-foreground">
						{t('chat.phase')} <span className="font-semibold text-foreground">{activeRun.phase}</span>
					</span>
					{activeRun.status === 'running' && (
						<Loader2 className="h-4 w-4 animate-spin text-primary" />
					)}
				</div>
			)}
			{lastFailedRun && (
				<div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
					<span className="font-semibold">{t('chat.lastRunFailed')}</span> {lastFailedRun.lastError || t('chat.unknownError')}
				</div>
			)}
			<form onSubmit={handleSubmit}>
				<Textarea
					className="min-h-[6rem] resize-none"
					onChange={e => setMessageDraft(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={t('chat.placeholder')}
					value={messageDraft}
				/>
				<div className="mt-3 flex items-center justify-between gap-3">
					<p className="text-xs text-muted-foreground">{t('chat.sendHint')}</p>
					<Button disabled={isSending || !messageDraft.trim()} type="submit">
						{isSending ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Send className="mr-2 h-4 w-4" />
						)}
						{t('chat.send')}
					</Button>
				</div>
			</form>
		</div>
	)
}
