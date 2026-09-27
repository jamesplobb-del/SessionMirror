import { useSyncExternalStore } from 'react'
import { getPlusSnapshot, subscribePlus } from './plusAccess'

export function usePlus() { return useSyncExternalStore(subscribePlus, getPlusSnapshot, getPlusSnapshot) }
