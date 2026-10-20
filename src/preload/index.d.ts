import type { ShiJuanApi } from '@shared/types'

declare global {
  interface Window {
    shijuan: ShiJuanApi
  }
}

export {}
