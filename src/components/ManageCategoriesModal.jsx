import { useState } from 'react'

/**
 * ManageCategoriesModal — lets a user assign/unassign a game to/from custom collections.
 *
 * Props:
 *   game       {object}   — the game record (must have .tags string[])
 *   categories {Category[]}
 *   onClose    {fn}
 *   onSaved    {fn}       — called with updated game record
 */
export default function ManageCategoriesModal({ game, categories, onClose, onSaved }) {
  // Local copy of selected tag ids (strings)
  const [selected, setSelected] = useState(new Set(game.tags ?? []))
  const [saving,   setSaving]   = useState(false)

  function toggle(catId) {
    const s = new Set(selected)
    if (s.has(String(catId))) s.delete(String(catId))
    else s.add(String(catId))
    setSelected(s)
  }

  async function handleSave() {
    setSaving(true)
    const updated = await window.api.invoke('games:setTags', game.id, [...selected])
    onSaved(updated)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-4 border-b border-brand-border">
          <div>
            <h2 className="text-base font-bold text-brand-text">Manage Collections</h2>
            <p className="text-xs text-brand-muted mt-0.5 truncate max-w-[220px]" title={game.title}>
              {game.title}
            </p>
          </div>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-red transition text-lg leading-none">✕</button>
        </div>

        {/* Category checklist */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
          {categories.length === 0 ? (
            <p className="text-sm text-brand-muted text-center py-6">
              No collections yet.<br />
              <span className="text-xs">Use the sidebar "+" to create one first.</span>
            </p>
          ) : (
            <div className="space-y-2">
              {categories.map(cat => {
                const checked = selected.has(String(cat.id))
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggle(cat.id)}
                    className={`w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all
                      ${checked
                        ? 'border-brand-accent bg-brand-accent/10 ring-1 ring-brand-accent/30'
                        : 'border-brand-border bg-brand-card hover:border-brand-accent/40'
                      }`}
                  >
                    {/* Checkbox visual */}
                    <div className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition
                      ${checked ? 'bg-brand-accent border-brand-accent' : 'border-brand-border'}`}>
                      {checked && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                    </div>
                    <span className="text-base leading-none">{cat.icon ?? '🗂'}</span>
                    <span className="text-sm font-medium text-brand-text">{cat.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-3 px-5 py-4 border-t border-brand-border">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-brand-border text-sm text-brand-muted hover:text-brand-text transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || categories.length === 0}
            className="flex-1 py-2 rounded-xl bg-brand-accent hover:bg-brand-hover text-white text-sm font-semibold transition disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
