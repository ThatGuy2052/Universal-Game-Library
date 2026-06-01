import { useState } from 'react'

export default function AddGameModal({ onClose, onAdded }) {
  const [title,      setTitle]      = useState('')
  const [exePath,    setExePath]    = useState('')
  const [sizeGb,     setSizeGb]     = useState('')
  const [coverLocal, setCoverLocal] = useState('')
  const [coverUrl,   setCoverUrl]   = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  async function pickExe() {
    const p = await window.api.invoke('dialog:openExe')
    if (p) {
      setExePath(p)
      // Auto-fill title from filename if empty
      if (!title) {
        const base = p.split(/[\\/]/).pop().replace(/\.[^/.]+$/, '').replace(/[_\-.]+/g, ' ')
        setTitle(base)
      }
    }
  }

  async function pickCover() {
    const p = await window.api.invoke('dialog:openImage')
    if (p) setCoverLocal(p)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required.'); return }

    setLoading(true)
    setError('')
    try {
      const parsedSize = Number.parseFloat(sizeGb)
      const newGame = await window.api.invoke('games:add', {
        title:       title.trim(),
        exe_path:    exePath || null,
        size:        Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : 0,
        cover_local: coverLocal || null,
        cover_url:   coverUrl  || null,
        platform:    'custom',
      })
      onAdded(newGame)
    } catch (err) {
      setError(err.message ?? 'Failed to add game.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border">
          <h2 className="text-lg font-bold text-brand-text">Add Game Manually</h2>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-red transition text-lg leading-none">✕</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase mb-1">
              Game Title <span className="text-brand-red">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Hollow Knight"
              className="w-full bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text placeholder-brand-muted focus:outline-none focus:border-brand-accent transition"
            />
          </div>

          {/* Executable */}
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase mb-1">Executable Path</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={exePath}
                onChange={e => setExePath(e.target.value)}
                placeholder="Select .exe or enter path"
                className="flex-1 bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text placeholder-brand-muted focus:outline-none focus:border-brand-accent transition"
              />
              <button
                type="button"
                onClick={pickExe}
                className="px-3 py-2 bg-brand-card border border-brand-border rounded-lg text-sm text-brand-muted hover:text-brand-text hover:border-brand-accent transition"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Size */}
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase mb-1">Size (GB)</label>
            <input
              type="text"
              value={sizeGb}
              onChange={e => setSizeGb(e.target.value)}
              placeholder="e.g. 12.5"
              className="w-full bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text placeholder-brand-muted focus:outline-none focus:border-brand-accent transition"
            />
          </div>

          {/* Cover art */}
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase mb-1">Cover Art</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={coverLocal}
                onChange={e => setCoverLocal(e.target.value)}
                placeholder="Local image path"
                className="flex-1 bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text placeholder-brand-muted focus:outline-none focus:border-brand-accent transition"
              />
              <button
                type="button"
                onClick={pickCover}
                className="px-3 py-2 bg-brand-card border border-brand-border rounded-lg text-sm text-brand-muted hover:text-brand-text hover:border-brand-accent transition"
              >
                Browse
              </button>
            </div>
            <input
              type="url"
              value={coverUrl}
              onChange={e => setCoverUrl(e.target.value)}
              placeholder="Or enter image URL"
              className="w-full bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text placeholder-brand-muted focus:outline-none focus:border-brand-accent transition"
            />
          </div>

          {error && <p className="text-xs text-brand-red">{error}</p>}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-brand-border text-sm text-brand-muted hover:text-brand-text hover:border-brand-text transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-brand-accent hover:bg-brand-hover text-white text-sm font-semibold transition disabled:opacity-50"
            >
              {loading ? 'Adding…' : 'Add Game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
