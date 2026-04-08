import { atom } from 'jotai'

export const themeAtom = atom(
	typeof window !== 'undefined'
		? localStorage.getItem('mhe-theme') || 'light'
		: 'light'
)

export const workspaceBusyKeyAtom = atom('')
export const adminBusyKeyAtom = atom('')
