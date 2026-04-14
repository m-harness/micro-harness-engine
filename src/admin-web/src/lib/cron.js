// Lightweight cron expression utility — no external dependencies.
// Supports standard 5-field cron: minute hour day month weekday

// Parse a single cron field into an array of matching integers.
// Supports: *, star/N, N-M, N-M/S, N,M,..., and combinations.
export function parseCronField(field, min, max) {
	const result = new Set()
	for (const part of field.split(',')) {
		const trimmed = part.trim()
		if (trimmed === '*') {
			for (let i = min; i <= max; i++) result.add(i)
			continue
		}
		const stepMatch = trimmed.match(/^(\*|(\d+)-(\d+))\/(\d+)$/)
		if (stepMatch) {
			const start = stepMatch[2] !== undefined ? parseInt(stepMatch[2], 10) : min
			const end = stepMatch[3] !== undefined ? parseInt(stepMatch[3], 10) : max
			const step = parseInt(stepMatch[4], 10)
			if (step < 1) continue
			for (let i = start; i <= end; i += step) {
				if (i >= min && i <= max) result.add(i)
			}
			continue
		}
		const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/)
		if (rangeMatch) {
			const start = parseInt(rangeMatch[1], 10)
			const end = parseInt(rangeMatch[2], 10)
			for (let i = start; i <= end; i++) {
				if (i >= min && i <= max) result.add(i)
			}
			continue
		}
		const num = parseInt(trimmed, 10)
		if (!isNaN(num) && num >= min && num <= max) {
			result.add(num)
		}
	}
	return [...result].sort((a, b) => a - b)
}

/**
 * Compute the next N execution times for a cron expression.
 */
export function getNextCronRuns(expression, count = 5) {
	const parts = expression.trim().split(/\s+/)
	if (parts.length !== 5) return []

	const minutes = parseCronField(parts[0], 0, 59)
	const hours = parseCronField(parts[1], 0, 23)
	const days = parseCronField(parts[2], 1, 31)
	const months = parseCronField(parts[3], 1, 12)
	const weekdays = parseCronField(parts[4], 0, 6)

	if (!minutes.length || !hours.length) return []

	const results = []
	const now = new Date()
	const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0)
	const limit = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000)

	const hasDayConstraint = parts[2] !== '*'
	const hasWeekdayConstraint = parts[4] !== '*'

	while (results.length < count && cursor < limit) {
		const m = cursor.getMonth() + 1
		const d = cursor.getDate()
		const wd = cursor.getDay()
		const h = cursor.getHours()
		const min = cursor.getMinutes()

		if (!months.includes(m)) {
			cursor.setMonth(cursor.getMonth() + 1, 1)
			cursor.setHours(0, 0, 0, 0)
			continue
		}

		const dayMatch = hasDayConstraint && hasWeekdayConstraint
			? days.includes(d) || weekdays.includes(wd)
			: hasDayConstraint
				? days.includes(d)
				: hasWeekdayConstraint
					? weekdays.includes(wd)
					: true

		if (!dayMatch) {
			cursor.setDate(cursor.getDate() + 1)
			cursor.setHours(0, 0, 0, 0)
			continue
		}

		if (!hours.includes(h)) {
			cursor.setHours(cursor.getHours() + 1, 0, 0, 0)
			continue
		}

		if (!minutes.includes(min)) {
			cursor.setMinutes(cursor.getMinutes() + 1, 0, 0)
			continue
		}

		results.push(new Date(cursor))
		cursor.setMinutes(cursor.getMinutes() + 1, 0, 0)
	}

	return results
}

/**
 * Convert a field config { mode, step, specific, rangeStart, rangeEnd } to a cron field string.
 */
export function cronFieldToString(config) {
	switch (config.mode) {
		case 'all':
			return '*'
		case 'step':
			return `*/${config.step || 1}`
		case 'specific':
			return config.specific?.length ? config.specific.sort((a, b) => a - b).join(',') : '*'
		case 'range':
			return `${config.rangeStart ?? 0}-${config.rangeEnd ?? 0}`
		default:
			return '*'
	}
}

/**
 * Parse a cron field string back to a config object.
 */
export function parseCronFieldToConfig(field, min, max) {
	if (field === '*') {
		return { mode: 'all', step: 1, specific: [], rangeStart: min, rangeEnd: max }
	}
	const stepMatch = field.match(/^\*\/(\d+)$/)
	if (stepMatch) {
		return { mode: 'step', step: parseInt(stepMatch[1], 10), specific: [], rangeStart: min, rangeEnd: max }
	}
	const rangeMatch = field.match(/^(\d+)-(\d+)$/)
	if (rangeMatch) {
		return { mode: 'range', step: 1, specific: [], rangeStart: parseInt(rangeMatch[1], 10), rangeEnd: parseInt(rangeMatch[2], 10) }
	}
	if (/^[\d,]+$/.test(field)) {
		return { mode: 'specific', step: 1, specific: field.split(',').map(Number), rangeStart: min, rangeEnd: max }
	}
	return { mode: 'all', step: 1, specific: [], rangeStart: min, rangeEnd: max }
}

const WEEKDAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土']

/**
 * Describe a cron expression in human-readable text.
 */
export function describeCron(expression, locale = 'ja') {
	const parts = expression.trim().split(/\s+/)
	if (parts.length !== 5) return expression

	const [min, hour, day, month, weekday] = parts
	const isJa = locale === 'ja'
	const wdLabels = isJa ? WEEKDAY_LABELS_JA : WEEKDAY_LABELS_EN

	const pieces = []

	if (month !== '*') {
		const months = parseCronField(month, 1, 12)
		pieces.push(isJa ? `${months.join(',')}月` : `month ${months.join(',')}`)
	}

	if (weekday !== '*') {
		const wds = parseCronField(weekday, 0, 6)
		const labels = wds.map(w => wdLabels[w])
		pieces.push(isJa ? `${labels.join(',')}曜日` : labels.join(','))
	}

	if (day !== '*') {
		const days = parseCronField(day, 1, 31)
		pieces.push(isJa ? `${days.join(',')}日` : `day ${days.join(',')}`)
	}

	if (hour !== '*') {
		if (hour.startsWith('*/')) {
			pieces.push(isJa ? `${hour.slice(2)}時間ごと` : `every ${hour.slice(2)} hours`)
		} else {
			const hours = parseCronField(hour, 0, 23)
			pieces.push(isJa ? `${hours.join(',')}時` : `${hours.join(',')}h`)
		}
	}

	if (min !== '*') {
		if (min.startsWith('*/')) {
			pieces.push(isJa ? `${min.slice(2)}分ごと` : `every ${min.slice(2)} min`)
		} else {
			const mins = parseCronField(min, 0, 59)
			pieces.push(isJa ? `${mins.join(',')}分` : `${mins.join(',')}m`)
		}
	}

	if (pieces.length === 0) {
		return isJa ? '毎分' : 'Every minute'
	}

	return pieces.join(' ')
}

/**
 * Format a relative time label from now.
 */
export function formatRelativeTime(date, locale = 'ja') {
	const now = new Date()
	const diffMs = date.getTime() - now.getTime()
	const diffMin = Math.round(diffMs / 60000)
	const isJa = locale === 'ja'

	if (diffMin < 1) return isJa ? 'まもなく' : 'soon'
	if (diffMin < 60) return isJa ? `${diffMin}分後` : `in ${diffMin}min`
	const diffHour = Math.round(diffMin / 60)
	if (diffHour < 24) return isJa ? `${diffHour}時間後` : `in ${diffHour}h`
	const diffDay = Math.round(diffHour / 24)
	return isJa ? `${diffDay}日後` : `in ${diffDay}d`
}
