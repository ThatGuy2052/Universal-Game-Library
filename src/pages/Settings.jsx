import { useState, useEffect } from 'react'
import {
  THEME_OPTIONS,
  DEFAULT_THEME,
  DEFAULT_CUSTOM_THEME,
  normalizeCustomTheme,
  applyThemeSelection,
} from '../themeEngine'

export default function Settings() {
  const [dropZone,    setDropZone]    = useState('')
  const [newDropZone, setNewDropZone] = useState('')
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState('')
  const [selectedTheme, setSelectedTheme] = useState(DEFAULT_THEME)
  const [customTheme, setCustomTheme] = useState(DEFAULT_CUSTOM_THEME)
  const [themeLoaded, setThemeLoaded] = useState(false)
  const [themeSaved, setThemeSaved] = useState(false)

  useEffect(() => {
    Promise.all([
      window.api.invoke('settings:getDropZone'),
      window.api.invoke('settings:get', 'theme:selected'),
      window.api.invoke('settings:get', 'theme:custom'),
    ]).then(([p, savedTheme, savedCustom]) => {
      setDropZone(p ?? '')
      setNewDropZone(p ?? '')
      setSelectedTheme(savedTheme ?? DEFAULT_THEME)
      setCustomTheme(normalizeCustomTheme(savedCustom ?? DEFAULT_CUSTOM_THEME))
      setThemeLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!themeLoaded) return

    applyThemeSelection(selectedTheme, customTheme)

    const timer = setTimeout(async () => {
      await window.api.invoke('settings:set', 'theme:selected', selectedTheme)
      await window.api.invoke('settings:set', 'theme:custom', normalizeCustomTheme(customTheme))
      setThemeSaved(true)
      setTimeout(() => setThemeSaved(false), 1200)
    }, 120)

    return () => clearTimeout(timer)
  }, [selectedTheme, customTheme, themeLoaded])

  async function pickFolder() {
    const p = await window.api.invoke('dialog:openFolder')
    if (p) setNewDropZone(p)
  }

  async function openDropZone() {
    if (dropZone) await window.api.invoke('shell:openPath', dropZone)
  }

  async function saveDropZone() {
    setError('')
    const result = await window.api.invoke('settings:setDropZone', newDropZone)
    if (result?.success === false) {
      setError(result.error ?? 'Failed to update.')
      return
    }
    setDropZone(newDropZone)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-bold text-brand-text">Settings</h2>
        <p className="text-sm text-brand-muted mt-1">Configure your Universal Game Library Manager</p>
      </div>

      {/* Drop zone section */}
      <section className="bg-brand-card border border-brand-border rounded-xl p-5 space-y-3">
        <h3 className="text-base font-semibold text-brand-text">Auto-Detection Drop Zone</h3>
        <p className="text-sm text-brand-muted">
          Drop game executables or folders into this directory and they will be automatically detected and added to your library.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={newDropZone}
            onChange={e => setNewDropZone(e.target.value)}
            className="flex-1 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-accent transition"
          />
          <button
            onClick={pickFolder}
            className="px-3 py-2 bg-brand-surface border border-brand-border rounded-lg text-sm text-brand-muted hover:text-brand-text hover:border-brand-accent transition"
          >
            Browse
          </button>
        </div>

        {error && <p className="text-xs text-brand-red">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={saveDropZone}
            className="px-4 py-2 bg-brand-accent hover:bg-brand-hover text-white text-sm font-semibold rounded-lg transition"
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
          {dropZone && (
            <button
              onClick={openDropZone}
              className="px-4 py-2 bg-brand-surface border border-brand-border text-sm text-brand-muted hover:text-brand-text rounded-lg transition"
            >
              Open Folder
            </button>
          )}
        </div>
      </section>

      {/* Theme section */}
      <section className="bg-brand-card border border-brand-border rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-brand-text">Application Theme</h3>
          <p className="text-sm text-brand-muted mt-1">
            Choose a preset palette or switch to a custom theme with real-time controls.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-brand-muted">Application Theme</label>
          <select
            value={selectedTheme}
            onChange={e => setSelectedTheme(e.target.value)}
            className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-accent transition"
          >
            {THEME_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {selectedTheme === 'custom' && (
          <div className="space-y-4 rounded-lg border border-brand-border bg-brand-surface/60 p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-brand-muted uppercase tracking-wide">
                <span>Color</span>
                <span>{customTheme.hue}\u00b0</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={customTheme.hue}
                onChange={e => setCustomTheme(prev => ({ ...prev, hue: Number(e.target.value) }))}
                className="w-full accent-brand-accent"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-brand-muted uppercase tracking-wide">
                <span>Lightness</span>
                <span>{customTheme.lightness}%</span>
              </div>
              <input
                type="range"
                min="25"
                max="80"
                value={customTheme.lightness}
                onChange={e => setCustomTheme(prev => ({ ...prev, lightness: Number(e.target.value) }))}
                className="w-full accent-brand-accent"
              />
            </div>
          </div>
        )}

        {themeSaved && <p className="text-xs text-brand-green">Theme saved</p>}
      </section>

      {/* About section */}
      <section className="bg-brand-card border border-brand-border rounded-xl p-5">
        <h3 className="text-base font-semibold text-brand-text mb-2">About</h3>
        <div className="space-y-1 text-sm text-brand-muted">
          <p><span className="text-brand-text font-medium">App:</span> Universal Game Library Manager v1.0.0</p>
          <p><span className="text-brand-text font-medium">Stack:</span> Electron · React · TailwindCSS · SQLite</p>
          <p><span className="text-brand-text font-medium">Features:</span> Real-time play-time tracking · File-drop detection · Steam library scanning</p>
        </div>
      </section>
    </div>
  )
}
