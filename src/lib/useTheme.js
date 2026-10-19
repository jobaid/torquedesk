import { useEffect } from 'react'

/** Light mode only. */
export function useThemeSync() {
  useEffect(() => {
    document.documentElement.dataset.theme = 'light'
  }, [])
}
