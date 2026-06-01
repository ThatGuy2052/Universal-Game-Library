export const THEME_OPTIONS = [
  { value: 'default-slate', label: 'Default Slate' },
  { value: 'light-slate', label: 'Light Slate' },
  { value: 'cyberpunk-neon', label: 'Cyberpunk' },
  { value: 'midnight-purple', label: 'Midnight Purple' },
  { value: 'emerald-forest', label: 'Emerald Forest' },
  { value: 'neo-minimal', label: 'Minimalist' },
  { value: 'earthy-organic', label: 'Organic' },
  { value: 'retro-terminal', label: 'Terminal' },
  { value: 'playful-gradient', label: 'Vibrant' },
  { value: 'luxury-dark', label: 'Luxury Dark' },
  { value: 'custom', label: 'Custom Theme' },
]

export const DEFAULT_THEME = 'default-slate'
export const DEFAULT_CUSTOM_THEME = { hue: 216, lightness: 53 }

const CUSTOM_KEYS = [
  '--brand-bg',
  '--brand-surface',
  '--brand-card',
  '--brand-border',
  '--brand-accent',
  '--brand-hover',
  '--brand-text',
  '--brand-muted',
]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min))
}

export function normalizeCustomTheme(value) {
  const hue = clamp(value?.hue ?? DEFAULT_CUSTOM_THEME.hue, 0, 360)
  const lightness = clamp(value?.lightness ?? DEFAULT_CUSTOM_THEME.lightness, 25, 80)
  return { hue, lightness }
}

export function applyCustomTheme(hueInput, lightnessInput) {
  const root = document.documentElement
  const hue = clamp(hueInput, 0, 360)
  const lightness = clamp(lightnessInput, 25, 80)

  root.style.setProperty('--brand-accent', `${hue} 85% ${lightness}%`)
  root.style.setProperty('--brand-hover', `${hue} 88% ${Math.min(90, lightness + 8)}%`)
  root.style.setProperty('--brand-bg', `${hue} 22% ${Math.max(5, lightness - 46)}%`)
  root.style.setProperty('--brand-surface', `${hue} 24% ${Math.max(8, lightness - 40)}%`)
  root.style.setProperty('--brand-card', `${hue} 28% ${Math.max(12, lightness - 34)}%`)
  root.style.setProperty('--brand-border', `${hue} 18% ${Math.max(18, lightness - 28)}%`)
  root.style.setProperty('--brand-text', `${hue} 24% ${Math.min(96, lightness + 42)}%`)
  root.style.setProperty('--brand-muted', `${hue} 10% ${Math.min(76, lightness + 18)}%`)
}

export function applyThemeSelection(theme, customTheme) {
  const root = document.documentElement
  const resolvedTheme = theme || DEFAULT_THEME
  root.setAttribute('data-app-theme', resolvedTheme)
  root.setAttribute('data-theme', resolvedTheme)

  try {
    localStorage.setItem('theme:selected', resolvedTheme)
  } catch {
    // Ignore storage failures in restricted contexts.
  }

  if (resolvedTheme === 'custom') {
    const custom = normalizeCustomTheme(customTheme)
    applyCustomTheme(custom.hue, custom.lightness)
    return
  }

  for (const key of CUSTOM_KEYS) {
    root.style.removeProperty(key)
  }
}
