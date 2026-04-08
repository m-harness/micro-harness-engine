import { atom } from 'jotai'

export const workspaceAtom = atom({
	conversations: [],
	apiTokens: []
})

export const selectedConversationIdAtom = atom(null)

export const conversationViewAtom = atom(null)
