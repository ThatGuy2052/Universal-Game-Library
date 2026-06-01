import { useState, useEffect, useCallback } from 'react'
import GameCard from '../components/GameCard'

export default function SteamLibrary({ runningIds, onLaunch, setGames, allGames, onOpenConflict }) {
  const [steamGames, setSteamGames] = useState([])
  const [scanning,   setScanning]   = useState(false)
  const [error,      setError]      = useState('')

  const scan = useCallback(async () => {
    setScanning(true)
    setError('')
    try {
      const found = await window.api.invoke('steam:scan')
      setSteamGames(found ?? [])
    } catch (err) {
      setError(err.message ?? 'Steam scan failed.')
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => { scan() }, [scan])

  async function importAll() {
    let count = 0
    for (const sg of steamGames) {
      // skip if already in db
      const exists = allGames.some(g => g.steam_appid === sg.steam_appid)
      if (exists) continue
      const newG = await window.api.invoke('games:add', sg)
      setGames(prev => [...prev, newG])
      count++
    }
    alert(`Imported ${count} new Steam game${count !== 1 ? 's' : ''}.`)
  }

  async function importSingle(sg) {
    const exists = allGames.some(g => g.steam_appid === sg.steam_appid)
    if (exists) { alert('Already in library.'); return }
    const newG = await window.api.invoke('games:add', sg)
    setGames(prev => [...prev, newG])
    alert(`"${sg.title}" imported.`)
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-brand-text">Steam Library</h2>
          <p className="text-sm text-brand-muted mt-0.5">
            Games detected in local Steam installation
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={scan}
            disabled={scanning}
            className="px-4 py-2 rounded-lg bg-brand-card border border-brand-border text-sm text-brand-muted hover:text-brand-text hover:border-brand-accent transition disabled:opacity-50"
          >
            {scanning ? '🔄 Scanning…' : '🔄 Re-scan'}
          </button>
          {steamGames.length > 0 && (
            <button
              onClick={importAll}
              className="px-4 py-2 rounded-lg bg-brand-accent hover:bg-brand-hover text-white text-sm font-semibold transition"
            >
              Import All ({steamGames.length})
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-brand-red/10 border border-brand-red/30 rounded-lg text-brand-red text-sm">
          {error}
        </div>
      )}

      {!scanning && steamGames.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center h-64 text-brand-muted gap-3">
          <span className="text-5xl">🔵</span>
          <p className="text-lg font-medium">No Steam games found</p>
          <p className="text-sm">Make sure Steam is installed and you have installed games.</p>
        </div>
      )}

      {steamGames.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {steamGames.map(sg => {
            // Check if it's already imported
            const imported = allGames.find(g => g.steam_appid === sg.steam_appid)
            return (
              <div key={sg.steam_appid} className="relative">
                {imported ? (
                  <GameCard
                    game={imported}
                    isRunning={runningIds.has(imported.id)}
                    onLaunch={onLaunch}
                    onDelete={async id => {
                      await window.api.invoke('games:delete', id)
                      setGames(prev => prev.filter(g => g.id !== id))
                    }}
                    onOpenConflict={onOpenConflict}
                  />
                ) : (
                  <SteamPreviewCard game={sg} onImport={() => importSingle(sg)} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Preview card for a Steam game not yet imported */
function SteamPreviewCard({ game, onImport }) {
  const [imgError, setImgError] = useState(false)
  return (
    <div className="group bg-brand-card border border-brand-border rounded-xl overflow-hidden flex flex-col hover:border-brand-accent/50 transition-all duration-200 opacity-75 hover:opacity-100">
      <div className="relative h-36 bg-brand-surface overflow-hidden">
        {!imgError ? (
          <img
            src={game.cover_url}
            alt={game.title}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-brand-border">🔵</div>
        )}
        <div className="absolute bottom-2 left-2 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-blue-600/80 text-white">
          steam
        </div>
      </div>
      <div className="flex flex-col flex-1 p-3">
        <p className="text-sm font-semibold text-brand-text truncate" title={game.title}>{game.title}</p>
        <p className="text-xs text-brand-muted">App ID: {game.steam_appid}</p>
      </div>
      <div className="border-t border-brand-border">
        <button
          onClick={onImport}
          className="w-full py-2 text-xs font-semibold uppercase tracking-wide text-brand-accent hover:bg-brand-accent hover:text-white transition"
        >
          + Import
        </button>
      </div>
    </div>
  )
}
