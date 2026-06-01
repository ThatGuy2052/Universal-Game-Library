import { useState, useRef, useEffect } from 'react'
import ManageCategoriesModal from './ManageCategoriesModal'

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

function formatSizeForBadge(sizeInBytes) {
  const val = parseFloat(sizeInBytes) || 0
  if (val <= 0) return '0 MB'
  
  // If value >= 1, assume it's already in GB (from getSizeValue in App.jsx)
  if (val >= 1) {
    return `${val.toFixed(1)} GB`
  }
  
  // Otherwise, if it's a very large number, assume it's in bytes
  // (for compatibility with raw file sizes)
  if (val > 1024) {
    const gb = val / (1024 * 1024 * 1024)
    if (gb >= 1) {
      return `${gb.toFixed(1)} GB`
    }
    
    const mb = val / (1024 * 1024)
    if (mb >= 1) {
      return `${Math.round(mb)} MB`
    }
    
    const kb = val / 1024
    return `${Math.round(kb)} KB`
  }
  
  // For small values (0 < val < 1) that aren't in bytes, assume they're fractional GB
  return `${val.toFixed(1)} GB`
}

function getSizeValueForBadge(game) {
  const rootSizeValue = parseFloat(game.size)
  if (Number.isFinite(rootSizeValue) && rootSizeValue > 0) return rootSizeValue

  const gbRaw =
    game.size_gb ??
    game.sizeGb ??
    game.install_size ??
    game.installSize ??
    game.disk_size ??
    game.diskSize ??
    game.file_size ??
    game.fileSize
  const gbValue = parseFloat(gbRaw)
  if (Number.isFinite(gbValue) && gbValue > 0) return gbValue

  const bytesRaw =
    game.size_on_disk ??
    game.size_bytes ??
    game.sizeBytes
  const bytesValue = parseFloat(bytesRaw)
  if (Number.isFinite(bytesValue) && bytesValue > 0) {
    return bytesValue / (1024 * 1024 * 1024)
  }

  return 0
}

export default function GameCard({ game, isRunning, onLaunch, onStop, onDelete, onOpenConflict, categories = [], onGameUpdated, sortBy }) {
  const [ctxMenu,        setCtxMenu]        = useState(null)   // { x, y } | null
  const [showCatModal,   setShowCatModal]   = useState(false)
  const [savingSteamOpt, setSavingSteamOpt] = useState(false)
  const [coverLoadFailed, setCoverLoadFailed] = useState(false)
  const ctxRef = useRef(null)

  const isPending = game.install_status === 'pending_resolution'
  const isCustomGame = game.isCustom === true || String(game.platform ?? '').toLowerCase() === 'custom'
  const launchSteamWithGame = !!(game.launch_steam_with_game ?? game.launchSteamWithGame)
  const badgeSizeValue = getSizeValueForBadge(game)
  const shouldShowSizeBadge = (sortBy === 'size-desc' || sortBy === 'size-asc') && badgeSizeValue > 0

  const rawCoverUrl = typeof game.coverUrl === 'string' ? game.coverUrl.trim() : ''
  const isBrokenDefaultCoverPath =
    rawCoverUrl === 'null' ||
    rawCoverUrl === 'undefined' ||
    rawCoverUrl === 'about:blank' ||
    /(^|\/)default[-_ ]?cover(\.|\/|$)/i.test(rawCoverUrl) ||
    /(^|\/)placeholder[-_ ]?cover(\.|\/|$)/i.test(rawCoverUrl)
  const hasRenderableCover = rawCoverUrl.length > 0 && !isBrokenDefaultCoverPath

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

  function handleContextMenu(e) {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
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
              src={rawCoverUrl}
              alt={game.title}
              loading="lazy"
              decoding="async"
              onError={() => setCoverLoadFailed(true)}
              className="w-full h-full object-cover"
            />
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
              {formatSizeForBadge(badgeSizeValue)}
            </div>
          )}

          {isPending && (
            <div className="absolute top-2 right-2 bg-brand-gold text-black text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">
              Conflict
            </div>
          )}
          {isRunning && !isPending && (
            <div className="absolute top-2 right-2 bg-brand-green text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">
              Playing
            </div>
          )}
          <div className={`absolute bottom-2 left-2 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full
            ${game.platform === 'steam' ? 'bg-blue-600/80 text-white' : 'bg-brand-gold/80 text-black'}`}>
            {game.platform}
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
