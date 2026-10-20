import { create } from 'zustand'
import type { ReaderSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/constants'
import { api } from '@/lib/bridge'
import { useUiStore } from './useUiStore'

interface PrefsState {
  settings: ReaderSettings
  ready: boolean
  load(): Promise<void>
  patch(change: Partial<ReaderSettings>): Promise<void>
}

export const usePrefsStore = create<PrefsState>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  ready: false,

  load: async () => {
    try {
      const settings = await api.prefs.read()
      set({ settings, ready: true })
    } catch {
      set({ ready: true })
    }
  },

  patch: async (change) => {
    const optimistic = { ...get().settings, ...change }
    set({ settings: optimistic })
    try {
      const settings = await api.prefs.write(change)
      set({ settings })
    } catch (error) {
      useUiStore.getState().showToast(error instanceof Error ? error.message : '设置保存失败')
      set({ settings: await api.prefs.read().catch(() => get().settings) })
    }
  }
}))
