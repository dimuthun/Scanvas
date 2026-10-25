import type { SnapApi } from '../shared/api'

declare global {
  interface Window {
    api: SnapApi
  }
}

export {}
