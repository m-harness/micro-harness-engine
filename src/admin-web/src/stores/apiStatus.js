import { atom } from 'jotai'

/** @type {import('jotai').PrimitiveAtom<'unknown' | 'connecting' | 'online'>} */
export const apiStatusAtom = atom('unknown')
