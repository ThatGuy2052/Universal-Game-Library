import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

const STATIC_NAV = [
  { to: '/all',    icon: '▦',  label: 'All Games'      },
  { to: '/steam',  icon: '🔵', label: 'Steam'          },
  { to: '/custom', icon: '📁', label: 'Manually Added' },
]

export default function Sidebar({ onAddGame, categories, onCategoryAdded, onCategoryRenamed, onCategoryDeleted }) {
  const navigate = useNavigate()

  // ── New-category inline form ───────────────────────────────────────────
  const [adding,    setAdding]    = useState(false)
  const [newName,   setNewName]   = useState('')
  // Rename state: { id, name } of category currently being edited, or null
  const [renaming,  setRenaming]  = useState(null)
  const [renameBuf, setRenameBuf] = useState('')

  function startAdd() {
    setAdding(true)
    setNewName('')
  }

  async function confirmAdd() {
    const name = newName.trim()
    if (!name) { setAdding(false); return }
    const cat = await window.api.invoke('categories:add', name)
    onCategoryAdded(cat)
    setAdding(false)
    setNewName('')
    navigate(`/category/${cat.id}`)
  }

  function startRename(cat) {
    setRenaming(cat)
    setRenameBuf(cat.name)
  }

  async function confirmRename() {
    if (!renaming) return
    const name = renameBuf.trim()
    if (name && name !== renaming.name) {
      const updated = await window.api.invoke('categories:update', renaming.id, { name })
      onCategoryRenamed(updated)
    }
    setRenaming(null)
  }

  async function handleDelete(cat) {
    if (!window.confirm(`Delete category "${cat.name}"?\nGames will not be removed, only untagged.`)) return
    await window.api.invoke('categories:delete', cat.id)
    onCategoryDeleted(cat.id)
    // If we're currently viewing this category, navigate away
    navigate('/all')
  }

  return (
    <aside className="w-52 shrink-0 bg-brand-surface border-r border-brand-border flex flex-col overflow-hidden">
      {/* ── Static nav ─────────────────────────────────────────────────── */}
      <nav className="pt-4 space-y-0.5 px-2 shrink-0">
        {STATIC_NAV.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ` +
              (isActive
                ? 'bg-brand-accent text-white'
                : 'text-brand-muted hover:bg-brand-card hover:text-brand-text')
            }
          >
            <span>{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* ── Collections heading ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-1 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-brand-muted">
          Collections
        </span>
        <button
          onClick={startAdd}
          title="New collection"
          className="w-5 h-5 rounded flex items-center justify-center text-brand-muted hover:text-brand-text hover:bg-brand-card transition text-base leading-none"
        >
          +
        </button>
      </div>

      {/* ── Inline "new category" input ─────────────────────────────────── */}
      {adding && (
        <div className="px-2 pb-1 shrink-0">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') setAdding(false) }}
            onBlur={confirmAdd}
            placeholder="Collection name…"
            className="w-full bg-brand-card border border-brand-accent rounded-md px-2 py-1 text-xs text-brand-text placeholder-brand-muted focus:outline-none"
          />
        </div>
      )}

      {/* ── Category list — scrollable ──────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 min-h-0">
        {categories.length === 0 && !adding && (
          <p className="px-3 py-2 text-xs text-brand-muted italic">No collections yet</p>
        )}

        {categories.map(cat => (
          <div key={cat.id} className="group flex items-center rounded-md overflow-hidden">
            {renaming?.id === cat.id ? (
              /* ── Inline rename input ── */
              <input
                autoFocus
                type="text"
                value={renameBuf}
                onChange={e => setRenameBuf(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setRenaming(null) }}
                onBlur={confirmRename}
                className="flex-1 bg-brand-card border border-brand-accent rounded-md mx-1 px-2 py-1 text-xs text-brand-text focus:outline-none"
              />
            ) : (
              <>
                <NavLink
                  to={`/category/${cat.id}`}
                  className={({ isActive }) =>
                    `flex-1 flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors rounded-md ` +
                    (isActive
                      ? 'bg-brand-accent text-white'
                      : 'text-brand-muted hover:bg-brand-card hover:text-brand-text')
                  }
                >
                  <span className="text-base leading-none">{cat.icon ?? '🗂'}</span>
                  <span className="truncate">{cat.name}</span>
                </NavLink>

                {/* Action icons — only visible on hover */}
                <div className="hidden group-hover:flex items-center pr-1 gap-0.5">
                  <button
                    onClick={() => startRename(cat)}
                    title="Rename"
                    className="w-5 h-5 rounded flex items-center justify-center text-brand-muted hover:text-brand-text hover:bg-brand-border transition text-xs"
                  >
                    ✏
                  </button>
                  <button
                    onClick={() => handleDelete(cat)}
                    title="Delete collection"
                    className="w-5 h-5 rounded flex items-center justify-center text-brand-muted hover:text-brand-red hover:bg-brand-red/10 transition text-xs"
                  >
                    ✕
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </nav>

      {/* ── Bottom actions ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-brand-border space-y-1 p-3">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ` +
            (isActive ? 'bg-brand-accent text-white' : 'text-brand-muted hover:bg-brand-card hover:text-brand-text')
          }
        >
          <span>⚙️</span><span>Settings</span>
        </NavLink>
        <button
          onClick={onAddGame}
          className="w-full py-2 rounded-md bg-brand-accent hover:bg-brand-hover text-white text-sm font-semibold transition"
        >
          + Add Game
        </button>
      </div>
    </aside>
  )
}

