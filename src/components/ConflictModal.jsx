import { useState } from 'react'

/**
 * ConflictModal — shown when a game has install_status === 'pending_resolution'.
 *
 * Props:
 *   game     {object}  — the game record with conflict_exes array
 *   onClose  {fn}      — called when the user dismisses without resolving
 *   onResolved {fn}    — called with the updated game record after resolution
 */
export default function ConflictModal({ game, onClose, onResolved }) {
  const [selected, setSelected] = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const exes = Array.isArray(game.conflict_exes) ? game.conflict_exes : []

  /** Strip to just the filename, keeping the immediate parent folder for context */
  function displayPath(fullPath) {
    const parts   = fullPath.replace(/\\/g, '/').split('/')
    const file    = parts[parts.length - 1]
    const parent  = parts.length > 1 ? parts[parts.length - 2] : null
    return { file, parent, full: fullPath }
  }

  async function handleConfirm() {
    if (!selected) { setError('Please select an executable first.'); return }
    setSaving(true)
    setError('')
    try {
      const result = await window.api.invoke('game:resolveConflict', game.id, selected)
      if (!result.success) {
        setError(result.error ?? 'Resolution failed.')
        setSaving(false)
        return
      }
      onResolved(result.game)
    } catch (err) {
      setError(err.message ?? 'Unknown error.')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/*
        Modal shell: flex-col + max-h so it never taller than the viewport.
        Header and footer are position:sticky equivalents (shrink-0) so they
        stay visible; only the exe list scrolls.
      */}
      <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* ── Header — never scrolls away ── */}
        <div className="shrink-0 flex items-start justify-between px-6 pt-5 pb-4 border-b border-brand-border gap-3">
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-gold/10 border border-brand-gold/30 flex items-center justify-center text-xl">
              ⚠️
            </div>
            <div>
              <h2 className="text-base font-bold text-brand-text">Executable Conflict Detected</h2>
              <p className="text-sm text-brand-muted mt-0.5">
                Multiple <code className="text-brand-accent text-xs">.exe</code> files were found in{' '}
                <span className="text-brand-text font-medium">"{game.title}"</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-brand-muted hover:text-brand-red transition text-lg leading-none mt-0.5"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          <p className="text-sm text-brand-muted mb-4">
            Select the primary game launcher below. Your choice will be saved permanently —
            future launches will skip this prompt.
          </p>

          <div className="space-y-2">
            {exes.map((exePath) => {
              const { file, parent, full } = displayPath(exePath)
              const isSelected = selected === full

              return (
                <button
                  key={full}
                  onClick={() => setSelected(full)}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition-all duration-150
                    ${isSelected
                      ? 'border-brand-accent bg-brand-accent/10 ring-1 ring-brand-accent/40'
                      : 'border-brand-border bg-brand-card hover:border-brand-accent/50 hover:bg-brand-card/80'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Radio dot */}
                    <div className={`shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition
                      ${isSelected ? 'border-brand-accent' : 'border-brand-border'}`}>
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-brand-accent" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-brand-text truncate">{file}</p>
                      {parent && (
                        <p className="text-xs text-brand-muted truncate mt-0.5">
                          …/{parent}/{file}
                        </p>
                      )}
                    </div>

                    {/* Heuristic badge: likely main launcher vs helper */}
                    {isLikelyMainExe(file) && (
                      <span className="shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-brand-green/20 text-brand-green border border-brand-green/30">
                        Likely main
                      </span>
                    )}
                    {isLikelyCrashHandler(file) && (
                      <span className="shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-brand-red/20 text-brand-red border border-brand-red/30">
                        Helper
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {error && (
            <p className="mt-3 text-xs text-brand-red">{error}</p>
          )}
        </div>

        {/* ── Footer — never scrolls away ── */}
        <div className="shrink-0 flex gap-3 px-6 py-4 border-t border-brand-border">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-brand-border text-sm text-brand-muted hover:text-brand-text hover:border-brand-text transition"
          >
            Decide Later
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || saving}
            className="flex-1 py-2.5 rounded-xl bg-brand-accent hover:bg-brand-hover text-white text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Confirm Selection'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Heuristic helpers ─────────────────────────────────────────────────────────

const HELPER_PATTERNS = [
  /crash/i, /handler/i, /report/i, /unins/i, /setup/i,
  /update/i, /patch/i, /launcher_helper/i, /redist/i,
  /vc_redist/i, /directx/i, /dxsetup/i,
]

const MAIN_EXE_PATTERNS = [
  /^game\.exe$/i, /^play\.exe$/i, /^start\.exe$/i,
]

function isLikelyCrashHandler(filename) {
  return HELPER_PATTERNS.some(re => re.test(filename))
}

function isLikelyMainExe(filename) {
  return MAIN_EXE_PATTERNS.some(re => re.test(filename))
}
