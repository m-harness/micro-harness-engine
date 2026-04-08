import { Button } from '../ui/button.jsx'
import { Input } from '../ui/input.jsx'

export function KeyValueEditor({ pairs, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value' }) {
	return (
		<div className="space-y-2">
			{pairs.map((pair, index) => (
				<div className="flex items-center gap-2" key={index}>
					<Input
						className="flex-1"
						onChange={e => {
							const next = [...pairs]
							next[index] = { ...next[index], key: e.target.value }
							onChange(next)
						}}
						placeholder={keyPlaceholder}
						value={pair.key}
					/>
					<Input
						className="flex-1"
						onChange={e => {
							const next = [...pairs]
							next[index] = { ...next[index], value: e.target.value }
							onChange(next)
						}}
						placeholder={valuePlaceholder}
						type={valuePlaceholder.includes('secret') ? 'password' : 'text'}
						value={pair.value}
					/>
					<Button onClick={() => onChange(pairs.filter((_, i) => i !== index))} size="sm" variant="outline" type="button">
						&times;
					</Button>
				</div>
			))}
			<Button className="w-full" onClick={() => onChange([...pairs, { key: '', value: '' }])} size="sm" variant="outline" type="button">
				+ Add
			</Button>
		</div>
	)
}

export function kvPairsToObject(pairs) {
	const obj = {}
	for (const { key, value } of pairs) {
		const k = key.trim()
		if (k) obj[k] = value
	}
	return obj
}
