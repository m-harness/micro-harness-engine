export function formatDate(value) {
	if (!value) return 'Not yet'
	try {
		return new Intl.DateTimeFormat('ja-JP', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(value))
	} catch {
		return value
	}
}

export function formatSchedule(automation) {
	if (automation.scheduleKind === 'cron') {
		return `Cron: ${automation.cronExpression || '—'}`
	}
	if (automation.scheduleKind === 'once') {
		return `Once: ${formatDate(automation.scheduledAt)}`
	}
	return '—'
}

export function formatJson(value) {
	return JSON.stringify(value, null, 2)
}
