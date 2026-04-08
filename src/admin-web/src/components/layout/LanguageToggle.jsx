import { Globe } from 'lucide-react'
import { useI18n } from '../../i18n/context.jsx'
import { Button } from '../ui/button.jsx'

export function LanguageToggle() {
	const { locale, setLocale } = useI18n()

	return (
		<Button
			variant="ghost"
			size="sm"
			onClick={() => setLocale(locale === 'en' ? 'ja' : 'en')}
			className="gap-1.5"
		>
			<Globe className="h-4 w-4" />
			<span className="text-xs font-semibold">{locale === 'en' ? 'EN' : 'JA'}</span>
		</Button>
	)
}
