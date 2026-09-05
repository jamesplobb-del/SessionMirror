import { createContext } from 'react'

export const PracticeReferenceContext = createContext<{ projectId?: string; query: string; autoSearch?: boolean }>({ query: '' })
