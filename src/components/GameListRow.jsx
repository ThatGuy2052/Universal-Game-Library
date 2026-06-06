// NOTE FOR CONTRIBUTORS: Any gameplay-card feature added to grid view must be implemented in list view at the same time to keep behavior parity.
import { useEffect, useRef, useState } from 'react'
import ManageCategoriesModal from './ManageCategoriesModal'
import { formatGameSize, getGameSizeGb } from '../utils/sizeFormat'

function normalizePlatformValue(raw) {
  const value = String(raw ?? '').trim().toLowerCase()
  if (!value) return 'custom'
  if (value === 'steam' || value === 'epic' || value === 'custom') return value
  if (value === 'manually added' || value === 'manual' || value === 'manual-added' || value === 'manually-added') return 'custom'
  if (value === 'epic games') return 'epic'
  return value
}

function toTrackedSeconds(raw) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return 0
  return value > 31536000 ? Math.floor(value / 1000) : Math.floor(value)
}

function formatTime(rawDuration) {
  const seconds = toTrackedSeconds(rawDuration)
  if (seconds <= 0) return 'None'
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`

  const hours = seconds / 3600
  const roundedHours = Number.isInteger(hours) ? `${hours}` : `${Math.round(hours * 10) / 10}`
  return `${roundedHours}h`
}

function formatDate(ts) {
  if (!ts) return 'Never'
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value ?? '').trim())
}

function toRenderableImageSrc(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^(data:|https?:\/\/|custom-cover:\/\/)/i.test(raw)) return raw
  if (/^[a-zA-Z]:\\/.test(raw)) return `file:///${raw.replace(/\\/g, '/')}`
  return raw
}

const FALLBACK_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDY0IDY0Ij48cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSIxMiIgZmlsbD0iIzFmMjkzNyIvPjxwYXRoIGQ9Ik0xNiAzNmwxNi0yMCAxNiAyMC0xNiAxMnoiIGZpbGw9IiMzOGJkZjgiLz48Y2lyY2xlIGN4PSIzMiIgY3k9IjMwIiByPSI2IiBmaWxsPSIjMGYxNzJhIi8+PC9zdmc+'

export default function GameListRow({ game, isRunning, onLaunch, onStop, onDelete, onOpenConflict, categories = [], onGameUpdated, onTogglePin }) {
  const [ctxMenu, setCtxMenu] = useState(null)
  const [showCatModal, setShowCatModal] = useState(false)
  const [savingSteamOpt, setSavingSteamOpt] = useState(false)
  const [savingPin, setSavingPin] = useState(false)
  const [hasShortcut, setHasShortcut] = useState(false)
  const ctxRef = useRef(null)

  const isPending = game.install_status === 'pending_resolution'
  const platform = normalizePlatformValue(game.platform)
  const isCustomGame = game.isCustom === true || platform === 'custom'
  const isPinned = game.isPinned === true
  const launchSteamWithGame = !!(game.launch_steam_with_game ?? game.launchSteamWithGame)
  const coverCandidate = typeof game.cover_url === 'string' ? game.cover_url.trim() : ''
  const epicCover = platform === 'epic' && isHttpUrl(coverCandidate) ? coverCandidate : ''
  const candidateIconRaw = typeof game.icon === 'string' && /^data:image\//i.test(game.icon)
    ? game.icon.trim()
    : (typeof game.exe_icon === 'string' && /^data:image\//i.test(game.exe_icon) ? game.exe_icon.trim() : '')
  const candidateIcon = toRenderableImageSrc(candidateIconRaw)
  const iconSrc = candidateIcon || epicCover || FALLBACK_ICON
  const sizeValue = getGameSizeGb(game)

  useEffect(() => {
    if (!ctxMenu) return
    function handler(e) {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu])

  // Refresh shortcut state whenever the context menu opens
  useEffect(() => {
    if (!ctxMenu) return
    window.api.invoke('shortcut:exists', game.id)
      .then(exists => setHasShortcut(!!exists))
      .catch(() => setHasShortcut(false))
  }, [ctxMenu, game.id])

  function handleContextMenu(e) {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  async function updatePinned(nextPinned) {
    if (savingPin) return
    setSavingPin(true)
    try {
      await onTogglePin?.(game.id, nextPinned)
    } finally {
      setSavingPin(false)
    }
  }

  return (
    <>
      <div onContextMenu={handleContextMenu} className="bg-brand-card border border-brand-border rounded-xl px-3 py-2 flex items-center gap-4">
        <img
          src={iconSrc}
          alt={game.title}
          className="w-10 h-10 rounded-md object-cover bg-brand-surface border border-brand-border shrink-0"
          onError={(e) => { e.currentTarget.src = FALLBACK_ICON }}
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-text truncate flex items-center gap-2" title={game.title}>
            <span className="truncate">{game.title}</span>
            {isPinned && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  void updatePinned(false)
                }}
                className="shrink-0 text-brand-gold hover:opacity-80 transition"
                title="Unpin game"
                disabled={savingPin}
              >
                📌
              </button>
            )}
          </p>
        </div>

        <div className="hidden md:block w-24 text-xs text-brand-muted text-right tabular-nums whitespace-nowrap">
          {formatGameSize(sizeValue)}
        </div>

        <div className="hidden md:block w-32 text-xs text-brand-muted text-right tabular-nums whitespace-nowrap">
          {formatTime(game.display_playtime ?? game.total_playtime ?? 0)}
        </div>

        <div className="hidden md:block w-36 text-xs text-brand-muted text-right">
          {formatDate(game.last_played)}
        </div>

        <span className={`text-[10px] font-semibold uppercase px-2 py-1 rounded-full w-20 text-center ${platform === 'steam' ? 'bg-blue-600/80 text-white' : platform === 'epic' ? 'bg-slate-800/90 text-white border border-slate-500/60' : 'bg-brand-gold/80 text-black'}`}>
          {platform.toUpperCase()}
        </span>

        <div className="flex items-center gap-2 shrink-0">
          {isPending ? (
            <button
              onClick={() => onOpenConflict?.(game)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-brand-gold border border-brand-gold/40 hover:bg-brand-gold hover:text-black transition"
            >
              Resolve
            </button>
          ) : isRunning ? (
            <button
              onClick={() => onStop?.(game.id)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-brand-red hover:opacity-90 transition"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => onLaunch(game.id)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-brand-accent hover:bg-brand-hover transition"
            >
              Play
            </button>
          )}

          <button
            onClick={() => { if (window.confirm(`Remove "${game.title}"?`)) onDelete(game.id) }}
            className="px-2.5 py-1.5 rounded-md text-xs text-brand-muted hover:text-brand-red hover:bg-brand-red/10 transition"
            title="Remove"
          >
            🗑
          </button>
        </div>
      </div>

      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          className="fixed z-[60] bg-brand-surface border border-brand-border rounded-xl shadow-xl py-1.5 min-w-[180px]"
        >
          <button
            onClick={() => { setCtxMenu(null); setShowCatModal(true) }}
            className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-brand-text hover:bg-brand-card transition"
          >
            <span>🗂</span> Manage Collections
          </button>

          {!isPending && (
            <button
              onClick={() => {
                setCtxMenu(null)
                if (isRunning) onStop?.(game.id)
                else onLaunch(game.id)
              }}
              className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-brand-text hover:bg-brand-card transition"
            >
              <span>{isRunning ? '■' : '▶'}</span> {isRunning ? 'Stop' : 'Play'}
            </button>
          )}

          {isCustomGame && (
            <button
              onClick={async () => {
                if (savingSteamOpt) return
                setSavingSteamOpt(true)
                try {
                  const result = await window.api.invoke('games:toggleLaunchSteam', game.id, !launchSteamWithGame)
                  if (result?.success && result.game) {
                    onGameUpdated?.(result.game)
                  } else if (result?.error) {
                    alert(`Could not update launch behavior: ${result.error}`)
                  }
                } finally {
                  setSavingSteamOpt(false)
                }
              }}
              className="w-full text-left flex items-center justify-between gap-3 px-4 py-2 text-sm text-brand-text hover:bg-brand-card transition disabled:opacity-60"
              disabled={savingSteamOpt}
              title="Start Steam before launching this custom game"
            >
              <span className="flex items-center gap-2.5">
                <span>🚀</span>
                <span>Launch Steam with Game</span>
              </span>
              <span
                className={`relative inline-flex h-4 w-8 shrink-0 rounded-full border transition ${launchSteamWithGame ? 'bg-brand-accent border-brand-accent' : 'bg-brand-bg border-brand-border'}`}
                aria-hidden="true"
              >
                <span
                  className={`absolute top-[1px] h-3 w-3 rounded-full bg-white transition ${launchSteamWithGame ? 'left-[17px]' : 'left-[1px]'}`}
                />
              </span>
            </button>
          )}

          <button
            onClick={async () => {
              setCtxMenu(null)
              await updatePinned(!isPinned)
            }}
            className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-brand-text hover:bg-brand-card transition disabled:opacity-60"
            disabled={savingPin}
          >
            <span>{isPinned ? '📍' : '📌'}</span> {isPinned ? 'Unpin Game' : 'Pin Game'}
          </button>

          <button
            onClick={async () => {
              setCtxMenu(null)
              if (hasShortcut) {
                const r = await window.api.invoke('shortcut:remove', game.id)
                if (!r?.success) alert(`Could not remove shortcut: ${r?.error}`)
              } else {
                const r = await window.api.invoke('shortcut:create', game.id)
                if (!r?.success) alert(`Could not create shortcut: ${r?.error}`)
              }
            }}
            className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-brand-text hover:bg-brand-card transition"
          >
            <span>{hasShortcut ? '✂️' : '🔗'}</span> {hasShortcut ? 'Remove Desktop Shortcut' : 'Create Desktop Shortcut'}
          </button>

          <div className="my-1 border-t border-brand-border" />
          <button
            onClick={() => { setCtxMenu(null); if (window.confirm(`Remove "${game.title}"?`)) onDelete(game.id) }}
            className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-brand-red hover:bg-brand-red/10 transition"
          >
            <span>🗑</span> Remove
          </button>
        </div>
      )}

      {showCatModal && (
        <ManageCategoriesModal
          game={game}
          categories={categories}
          onClose={() => setShowCatModal(false)}
          onSaved={(updated) => {
            onGameUpdated?.(updated)
            setShowCatModal(false)
          }}
        />
      )}
    </>
  )
}
