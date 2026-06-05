import { create } from 'zustand'
import type { Novel } from '@/lib/types'

interface AppState {
  currentNovel: Novel | null
  setCurrentNovel: (n: Novel | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentNovel: null,
  setCurrentNovel: (n) => set({ currentNovel: n }),
}))
