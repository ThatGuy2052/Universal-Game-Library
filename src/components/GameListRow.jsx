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

const FALLBACK_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDY0IDY0Ij48cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSIxMiIgZmlsbD0iIzFmMjkzNyIvPjxwYXRoIGQ9Ik0xNiAzNmwxNi0yMCAxNiAyMC0xNiAxMnoiIGZpbGw9IiMzOGJkZjgiLz48Y2lyY2xlIGN4PSIzMiIgY3k9IjMwIiByPSI2IiBmaWxsPSIjMGYxNzJhIi8+PC9zdmc+'

export default function GameListRow({ game, isRunning, onLaunch, onStop, onDelete, onOpenConflict }) {
  const isPending = game.install_status === 'pending_resolution'
  const iconSrc = game.exe_icon || game.cover_url || FALLBACK_ICON
  const platform = String(game.platform ?? 'custom').toLowerCase()

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl px-3 py-2 flex items-center gap-4">
      <img
        src={iconSrc}
        alt={game.title}
        className="w-10 h-10 rounded-md object-cover bg-brand-surface border border-brand-border shrink-0"
        onError={(e) => { e.currentTarget.src = FALLBACK_ICON }}
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-brand-text truncate" title={game.title}>{game.title}</p>
      </div>

      <div className="hidden md:block w-32 text-xs text-brand-muted text-right tabular-nums whitespace-nowrap">
        {formatTime(game.display_playtime ?? game.total_playtime ?? 0)}
      </div>

      <div className="hidden md:block w-36 text-xs text-brand-muted text-right">
        {formatDate(game.last_played)}
      </div>

      <span className={`text-[10px] font-semibold uppercase px-2 py-1 rounded-full w-20 text-center ${platform === 'steam' ? 'bg-blue-600/80 text-white' : 'bg-brand-gold/80 text-black'}`}>
        {platform}
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
  )
}
