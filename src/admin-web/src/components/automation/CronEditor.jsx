import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n/context.jsx'
import { Button } from '../ui/button.jsx'
import { Input } from '../ui/input.jsx'
import { cronFieldToString, describeCron, formatRelativeTime, getNextCronRuns, parseCronFieldToConfig } from '../../lib/cron.js'

const PRESETS = [
	{ key: 'everyMinute', cron: '* * * * *' },
	{ key: 'every5Minutes', cron: '*/5 * * * *' },
	{ key: 'everyHour', cron: '0 * * * *' },
	{ key: 'dailyMidnight', cron: '0 0 * * *' },
	{ key: 'daily9am', cron: '0 9 * * *' },
	{ key: 'weekdays9am', cron: '0 9 * * 1-5' },
	{ key: 'weeklySunday', cron: '0 0 * * 0' },
	{ key: 'monthly1st', cron: '0 0 1 * *' }
]

const FIELD_DEFS = [
	{ name: 'minute', min: 0, max: 59 },
	{ name: 'hour', min: 0, max: 23 },
	{ name: 'day', min: 1, max: 31 },
	{ name: 'month', min: 1, max: 12 },
	{ name: 'weekday', min: 0, max: 6 }
]

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MODES = ['all', 'step', 'specific', 'range']

function initFieldConfigs(cronStr) {
	const parts = cronStr.trim().split(/\s+/)
	if (parts.length !== 5) parts.push(...Array(5 - parts.length).fill('*'))
	return FIELD_DEFS.map((def, i) => parseCronFieldToConfig(parts[i] || '*', def.min, def.max))
}

function buildCronFromConfigs(configs) {
	return configs.map(c => cronFieldToString(c)).join(' ')
}

function FieldEditor({ fieldDef, config, onChange, t }) {
	const { name, min, max } = fieldDef
	const isWeekday = name === 'weekday'
	const isMonth = name === 'month'

	function setMode(mode) {
		onChange({ ...config, mode })
	}

	function toggleSpecific(val) {
		const set = new Set(config.specific)
		if (set.has(val)) set.delete(val)
		else set.add(val)
		onChange({ ...config, mode: 'specific', specific: [...set] })
	}

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center gap-2">
				<span className="w-12 text-xs font-medium text-muted-foreground">{t(`cron.${name}`)}</span>
				<select
					className="rounded-md border bg-background px-2 py-1 text-xs"
					value={config.mode}
					onChange={e => setMode(e.target.value)}
				>
					{MODES.map(m => (
						<option key={m} value={m}>{t(`cron.${m}`)}</option>
					))}
				</select>

				{config.mode === 'step' && (
					<Input
						className="h-7 w-16 text-xs"
						type="number"
						min="1"
						max={max}
						value={config.step}
						onChange={e => onChange({ ...config, step: parseInt(e.target.value, 10) || 1 })}
					/>
				)}

				{config.mode === 'range' && (
					<div className="flex items-center gap-1">
						<Input
							className="h-7 w-14 text-xs"
							type="number"
							min={min}
							max={max}
							value={config.rangeStart}
							onChange={e => onChange({ ...config, rangeStart: parseInt(e.target.value, 10) || min })}
						/>
						<span className="text-xs">-</span>
						<Input
							className="h-7 w-14 text-xs"
							type="number"
							min={min}
							max={max}
							value={config.rangeEnd}
							onChange={e => onChange({ ...config, rangeEnd: parseInt(e.target.value, 10) || max })}
						/>
					</div>
				)}
			</div>

			{config.mode === 'specific' && (
				<div className="ml-14 flex flex-wrap gap-1">
					{Array.from({ length: max - min + 1 }, (_, i) => min + i).map(val => {
						const checked = config.specific.includes(val)
						let label = String(val)
						if (isWeekday) label = t(`cron.${WEEKDAY_KEYS[val]}`)
						else if (isMonth) label = `${val}`

						return (
							<button
								key={val}
								type="button"
								onClick={() => toggleSpecific(val)}
								className={`rounded border px-1.5 py-0.5 text-xs transition-colors ${
									checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'
								}`}
							>
								{label}
							</button>
						)
					})}
				</div>
			)}
		</div>
	)
}

function CronPreview({ expression, locale, t }) {
	const runs = useMemo(() => getNextCronRuns(expression, 5), [expression])
	const description = useMemo(() => describeCron(expression, locale), [expression, locale])

	if (!runs.length) return null

	return (
		<div className="space-y-1.5 rounded border bg-muted/30 p-2.5">
			<div className="text-xs font-medium">{t('cron.nextRuns')}</div>
			<div className="text-xs text-muted-foreground">{description}</div>
			<ul className="space-y-0.5">
				{runs.map((run, i) => (
					<li key={i} className="text-xs text-muted-foreground">
						{i + 1}. {run.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
						{' '}
						<span className="text-muted-foreground/70">({formatRelativeTime(run, locale)})</span>
					</li>
				))}
			</ul>
		</div>
	)
}

export function CronEditor({ value = '* * * * *', onChange }) {
	const { t, locale } = useI18n()
	const [configs, setConfigs] = useState(() => initFieldConfigs(value))
	const [directInput, setDirectInput] = useState(value)
	const [showDirect, setShowDirect] = useState(false)

	// Sync from external value changes
	useEffect(() => {
		const newConfigs = initFieldConfigs(value)
		setConfigs(newConfigs)
		setDirectInput(value)
	}, [value])

	function updateField(index, newConfig) {
		const next = configs.map((c, i) => (i === index ? newConfig : c))
		setConfigs(next)
		const cron = buildCronFromConfigs(next)
		setDirectInput(cron)
		onChange(cron)
	}

	function applyPreset(cron) {
		setConfigs(initFieldConfigs(cron))
		setDirectInput(cron)
		onChange(cron)
	}

	function handleDirectChange(e) {
		const v = e.target.value
		setDirectInput(v)
		if (v.trim().split(/\s+/).length === 5) {
			setConfigs(initFieldConfigs(v))
			onChange(v.trim())
		}
	}

	function handleReset() {
		applyPreset('* * * * *')
	}

	const expression = buildCronFromConfigs(configs)

	return (
		<div className="space-y-3">
			{/* Presets */}
			<div className="space-y-1.5">
				<div className="text-xs font-medium text-muted-foreground">{t('cron.preset')}</div>
				<div className="flex flex-wrap gap-1.5">
					{PRESETS.map(p => (
						<Button
							key={p.key}
							type="button"
							size="sm"
							variant={expression === p.cron ? 'default' : 'outline'}
							className="h-7 text-xs"
							onClick={() => applyPreset(p.cron)}
						>
							{t(`cron.${p.key}`)}
						</Button>
					))}
				</div>
			</div>

			{/* Detail field editors */}
			<div className="space-y-1.5">
				<div className="text-xs font-medium text-muted-foreground">{t('cron.detailSettings')}</div>
				<div className="space-y-2 rounded border bg-muted/30 p-2.5">
					{FIELD_DEFS.map((def, i) => (
						<FieldEditor
							key={def.name}
							fieldDef={def}
							config={configs[i]}
							onChange={c => updateField(i, c)}
							t={t}
						/>
					))}
				</div>
			</div>

			{/* Generated expression + direct input toggle */}
			<div className="flex items-center gap-2">
				<div className="flex-1 rounded border bg-background px-3 py-1.5 font-mono text-sm">{expression}</div>
				<Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowDirect(!showDirect)}>
					{t('cron.directInput')}
				</Button>
				<Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={handleReset}>
					{t('cron.reset')}
				</Button>
			</div>

			{showDirect && (
				<Input
					value={directInput}
					onChange={handleDirectChange}
					placeholder="* * * * *"
					className="font-mono text-sm"
				/>
			)}

			{/* Preview */}
			<CronPreview expression={expression} locale={locale} t={t} />
		</div>
	)
}
