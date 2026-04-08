import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, translations } from './translations.js'

function detectLocale() {
	if (typeof window === 'undefined') {
		return DEFAULT_LOCALE
	}

	const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
	if (SUPPORTED_LOCALES.includes(stored)) {
		return stored
	}

	const browserLocale = String(window.navigator.language || '').toLowerCase()
	return browserLocale.startsWith('ja') ? 'ja' : 'en'
}

function resolveMessage(locale, key) {
	const segments = key.split('.')
	let current = translations[locale]

	for (const segment of segments) {
		if (current == null || typeof current !== 'object') {
			return null
		}
		current = current[segment]
	}

	return typeof current === 'string' ? current : null
}

function interpolate(message, values) {
	return message.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? ''))
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
	const [locale, setLocale] = useState(detectLocale)

	useEffect(() => {
		window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
		document.documentElement.lang = locale
	}, [locale])

	const value = useMemo(() => ({
		locale,
		setLocale,
		t(key, values = {}) {
			const message =
				resolveMessage(locale, key) ??
				resolveMessage(DEFAULT_LOCALE, key) ??
				values.defaultValue ??
				key

			return interpolate(message, values)
		}
	}), [locale])

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
	const context = useContext(I18nContext)
	if (!context) {
		throw new Error('useI18n must be used within I18nProvider.')
	}
	return context
}
