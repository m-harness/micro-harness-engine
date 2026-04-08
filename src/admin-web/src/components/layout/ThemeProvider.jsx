import { useEffect } from 'react'
import { useAtom } from 'jotai'
import { themeAtom } from '../../stores/ui.js'

export function ThemeProvider({ children }) {
	const [theme] = useAtom(themeAtom)

	useEffect(() => {
		const root = document.documentElement
		root.classList.remove('light', 'dark')
		root.classList.add(theme)
	}, [theme])

	return children
}
