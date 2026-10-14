export function initTheme() {
  const dark = typeof localStorage !== 'undefined' && localStorage.getItem('queuec-theme') === 'dark'
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', dark)
  }
  return dark
}

export function toggleTheme() {
  if (typeof document === 'undefined') return false
  const dark = !document.documentElement.classList.contains('dark')
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem('queuec-theme', dark ? 'dark' : 'light')
  } catch {}
  return dark
}
