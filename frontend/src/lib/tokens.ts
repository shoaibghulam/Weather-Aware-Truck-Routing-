/**
 * Read a design token (CSS custom property) from :root at runtime.
 * The map needs literal colour strings for paint properties; reading them from
 * tokens.css keeps one source of truth for the panel and the map.
 */
export function readToken(name: string, fallback = 'gray'): string {
  if (typeof window === 'undefined') return fallback
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}
