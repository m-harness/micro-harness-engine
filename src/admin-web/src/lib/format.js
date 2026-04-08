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

export function formatInterval(minutes) {
	if (!minutes) return 'Manual'
	if (minutes < 60) return `Every ${minutes} min`
	if (minutes % 60 === 0) return `Every ${minutes / 60} hr`
	return `Every ${minutes} min`
}

export function formatJson(value) {
	return JSON.stringify(value, null, 2)
}
