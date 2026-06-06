import { useState, useRef, useEffect } from 'react'
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
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function GameCard({ game, isRunning, onLaunch, onStop, onDelete, onOpenConflict, categories = [], onGameUpdated, onTogglePin, sortBy }) {
  const [ctxMenu,        setCtxMenu]        = useState(null)   // { x, y } | null
  const [showCatModal,   setShowCatModal]   = useState(false)
  const [savingSteamOpt, setSavingSteamOpt] = useState(false)
  const [savingPin,      setSavingPin]      = useState(false)
  const [coverLoadFailed, setCoverLoadFailed] = useState(false)
  const [hasShortcut,     setHasShortcut]     = useState(false)
  const ctxRef = useRef(null)

  const isPending = game.install_status === 'pending_resolution'
  const platformLabel = normalizePlatformValue(game.platform)
  const isCustomGame = game.isCustom === true || platformLabel === 'custom'
  const isPinned = game.isPinned === true
  const launchSteamWithGame = !!(game.launch_steam_with_game ?? game.launchSteamWithGame)
  const badgeSizeValue = getGameSizeGb(game)
  const shouldShowSizeBadge = (sortBy === 'size-desc' || sortBy === 'size-asc') && badgeSizeValue > 0

  const rawCoverUrl =
    typeof game.coverUrl === 'string' ? game.coverUrl.trim()
      : (typeof game.cover_url === 'string' ? game.cover_url.trim() : '')
  const rawGameIcon = typeof game.icon === 'string' ? game.icon.trim() : ''
  const hasRenderableGameIcon = /^data:image\//i.test(rawGameIcon)
  const safeCoverUrl = platformLabel === 'epic' && !/^https?:\/\//i.test(rawCoverUrl)
    ? ''
    : rawCoverUrl
  const isBrokenDefaultCoverPath =
    safeCoverUrl === 'null' ||
    safeCoverUrl === 'undefined' ||
    safeCoverUrl === 'about:blank' ||
    /(^|\/)default[-_ ]?cover(\.|\/|$)/i.test(safeCoverUrl) ||
    /(^|\/)placeholder[-_ ]?cover(\.|\/|$)/i.test(safeCoverUrl)
  const hasRenderableCover = safeCoverUrl.length > 0 && !isBrokenDefaultCoverPath

  useEffect(() => {
    setCoverLoadFailed(false)
  }, [game.coverUrl])

  // Close context menu on outside click
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
      <div
        onContextMenu={handleContextMenu}
        className={`relative bg-brand-card border rounded-xl overflow-hidden flex flex-col
          ${isPending
            ? 'border-brand-gold/60'
            : 'border-brand-border'
          }`}
      >
        {/* Cover art */}
        <div className="relative h-36 bg-brand-surface overflow-hidden">
          {hasRenderableCover && !coverLoadFailed ? (
            <img
              src={safeCoverUrl}
              alt={game.title}
              loading="lazy"
              decoding="async"
              onError={() => setCoverLoadFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : hasRenderableGameIcon ? (
            <div className="w-full h-full bg-brand-bg/90 flex flex-col items-center justify-center px-3 text-center">
              <img
                src={rawGameIcon}
                alt={game.title}
                loading="lazy"
                decoding="async"
                onError={() => setCoverLoadFailed(true)}
                className="w-16 h-16 object-contain mb-2 drop-shadow-[0_10px_20px_rgba(0,0,0,0.35)]"
              />
              <p className="text-xs font-semibold text-brand-muted truncate w-full" title={game.title}>
                {game.title}
              </p>
            </div>
          ) : (
            <div className="w-full h-full bg-brand-bg/90 flex flex-col items-center justify-center px-3 text-center">
              <div className="text-4xl text-brand-border mb-1">{isPending ? '⚠️' : '🎮'}</div>
              <p className="text-xs font-semibold text-brand-muted truncate w-full" title={game.title}>
                {game.title}
              </p>
            </div>
          )}

          {/* Size Badge — only visible during size-based sort */}
          {shouldShowSizeBadge && (
            <div className="absolute top-2 left-2 bg-brand-surface/90 backdrop-blur-sm text-white text-[10px] font-bold uppercase px-2 py-1 rounded-lg border border-brand-border/50">
              {formatGameSize(badgeSizeValue)}
            </div>
          )}

          {isPinned && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                void updatePinned(false)
              }}
              className="absolute top-2 right-2 bg-brand-surface/90 backdrop-blur-sm text-brand-gold text-xs font-bold px-2 py-1 rounded-lg border border-brand-border/50 hover:bg-brand-card transition"
              title="Unpin game"
              disabled={savingPin}
            >
              📌
            </button>
          )}

          {isPending && (
            <div className={`absolute top-2 bg-brand-gold text-black text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${isPinned ? 'right-10' : 'right-2'}`}>
              Conflict
            </div>
          )}
          {isRunning && !isPending && (
            <div className={`absolute top-2 bg-brand-green text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${isPinned ? 'right-10' : 'right-2'}`}>
              Playing
            </div>
          )}
          <div className={`absolute bottom-2 left-2 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full
            ${platformLabel === 'steam'
              ? 'bg-blue-600/80 text-white'
              : platformLabel === 'epic'
                ? 'bg-slate-800/90 text-white border border-slate-500/60'
                : 'bg-brand-gold/80 text-black'}`}>
            {platformLabel.toUpperCase()}
          </div>
        </div>

        {/* Info */}
        <div className="flex flex-col flex-1 p-3 gap-1">
          <p className="text-sm font-semibold text-brand-text truncate" title={game.title}>
            {game.title}
          </p>
          {isPending ? (
            <p className="text-xs text-brand-gold">
              ⚠️ {(game.conflict_exes?.length ?? 0)} executables found — action required
            </p>
          ) : (
            <>
              <p className="text-xs text-brand-muted tabular-nums">⏱ {formatTime(game.display_playtime ?? game.total_playtime)}</p>
              {game.last_played && (
                <p className="text-xs text-brand-muted">📅 {formatDate(game.last_played)}</p>
              )}
            </>
          )}
        </div>

        {/* Action bar */}
        <div className="flex border-t border-brand-border">
          {isPending ? (
            <button
              onClick={() => onOpenConflict?.(game)}
              className="flex-1 py-2 text-xs font-semibold uppercase tracking-wide text-brand-gold hover:bg-brand-gold hover:text-black transition"
            >
              ⚠️ Resolve Conflict
            </button>
          ) : isRunning ? (
            <button
              onClick={() => onStop?.(game.id)}
              className="flex-1 py-2 text-xs font-semibold uppercase tracking-wide text-white bg-brand-red hover:opacity-90 transition"
            >
              ■ Stop
            </button>
          ) : (
            <button
              onClick={() => onLaunch(game.id)}
              className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wide transition
                text-brand-accent hover:bg-brand-accent hover:text-white`}
            >
              ▶ Play
            </button>
          )}
          <button
            onClick={() => { if (window.confirm(`Remove "${game.title}"?`)) onDelete(game.id) }}
            className="px-3 py-2 text-xs text-brand-muted hover:text-brand-red hover:bg-brand-red/10 transition border-l border-brand-border"
            title="Remove"
          >
            🗑
          </button>
        </div>
      </div>

      {/* ── Right-click context menu ── */}
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
              className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-brand-text hover:bg-brand-card transition disabled:opacity-40"
            >
              <span>{isRunning ? '■' : '▶'}</span> {isRunning ? 'Stop' : 'Play'}
            </button>
          )}

          <button
            onClick={async () => {
              setCtxMenu(null)
              const result = await window.api.invoke('games:changeAppearance', game.id)
              if (result?.success && result.game) {
                onGameUpdated?.({
                  ...result.game,
                  updated_at: Math.floor(Date.now() / 1000),
                })
                return
              }
              if (!result?.canceled && result?.error) {
                alert(`Could not change appearance: ${result.error}`)
              }
            }}
            className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-brand-text hover:bg-brand-card transition"
          >
            <span>🖼</span> Change Appearance
          </button>

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

      {/* ── Manage Categories modal ── */}
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
