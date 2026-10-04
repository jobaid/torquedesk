import { useEffect } from 'react'
import { useApp } from '../store/useApp'

/** Applies the Light / Dark / System preference to <html data-theme>. */
export function useThemeSync() {
  const theme = useApp((s) => s.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}
