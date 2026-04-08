import { useAtom } from 'jotai'
import { useCallback, useEffect } from 'react'
import { themeAtom } from '../stores/ui.js'

export function useTheme() {
	const [theme, setTheme] = useAtom(themeAtom)

	useEffect(() => {
		const root = document.documentElement
		root.classList.remove('light', 'dark')
		root.classList.add(theme)
		localStorage.setItem('mhe-theme', theme)
	}, [theme])

	const toggleTheme = useCallback(() => {
		setTheme(current => current === 'dark' ? 'light' : 'dark')
	}, [setTheme])

	return { theme, setTheme, toggleTheme }
}
