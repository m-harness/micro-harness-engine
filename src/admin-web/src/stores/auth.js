import { atom } from 'jotai'

export const authStateAtom = atom({
	user: null,
	csrfToken: '',
	bootstrapRequired: false,
	webBootstrapEnabled: false
})

export const adminAuthStateAtom = atom({
	adminAuthenticated: false,
	csrfToken: '',
	adminEnabled: false,
	user: null
})
