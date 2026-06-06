import { useState, useEffect, useCallback, useMemo } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Sidebar        from './components/Sidebar'
import TitleBar       from './components/TitleBar'
import SearchBar      from './components/SearchBar'
import AddGameModal   from './components/AddGameModal'
import ConflictModal  from './components/ConflictModal'
import AllGames       from './pages/AllGames'
import CategoryView   from './pages/CategoryView'
import Settings       from './pages/Settings'
import { applyThemeSelection, DEFAULT_THEME, normalizeCustomTheme } from './themeEngine'

function normalizePlatformValue(raw) {
  const value = String(raw ?? '').trim().toLowerCase()
  if (!value) return 'custom'
  if (value === 'steam' || value === 'epic' || value === 'custom' || value === 'all') return value
  if (value === 'manually added' || value === 'manual' || value === 'manual-added' || value === 'manually-added') return 'custom'
  if (value === 'epic games') return 'epic'
  return value
}

export default function App() {
  const [games,       setGames]       = useState([])
  const [categories,  setCategories]  = useState([])
  const [runningIds,  setRunningIds]  = useState(new Set())
  const [runningSince, setRunningSince] = useState({})
  const [playtimeTick, setPlaytimeTick] = useState(() => Date.now())
  const [searchQuery, setSearchQuery] = useState('')
  const [platform,    setPlatform]    = useState('all')
  const [sortBy,      setSortBy]      = useState('title')
  const [viewMode,    setViewMode]    = useState(() => {
    const saved = localStorage.getItem('viewMode')
    return saved === 'list' ? 'list' : 'grid'
  })
  const [showAddModal,  setShowAddModal]  = useState(false)
  const [conflictGame,  setConflictGame]  = useState(null)

  const refreshGames = useCallback(async () => {
    const [gamesData, catsData] = await Promise.all([
      window.api.invoke('games:getAll'),
      window.api.invoke('categories:getAll'),
    ])
    setGames(gamesData  ?? [])
    setCategories(catsData ?? [])
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const payload = await window.api.invoke('library:loadAll')
        if (!mounted) return

        const gamesData = Array.isArray(payload?.games) ? payload.games : []
        const catsData = Array.isArray(payload?.categories) ? payload.categories : []
        setGames(gamesData)
        setCategories(catsData)
      } catch {
        await Promise.allSettled([
          window.api.invoke('steam:scan'),
          window.api.invoke('epic:scan'),
        ])
        if (mounted) await refreshGames()
      }
    })()
    return () => { mounted = false }
  }, [refreshGames])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [selectedTheme, customTheme] = await Promise.all([
        window.api.invoke('settings:get', 'theme:selected'),
        window.api.invoke('settings:get', 'theme:custom'),
      ])

      if (cancelled) return
      applyThemeSelection(selectedTheme ?? DEFAULT_THEME, normalizeCustomTheme(customTheme))
    })().catch(() => {
      if (!cancelled) applyThemeSelection(DEFAULT_THEME)
    })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const off1 = window.api.on('game:added', (g) => {
      setGames(prev => {
        const exists = prev.some(x => x.id === g.id)
        return exists ? prev.map(x => x.id === g.id ? g : x) : [...prev, g]
      })
    })
    const off2 = window.api.on('game:launched', ({ id }) => {
      setRunningIds(prev => new Set([...prev, id]))
      setRunningSince(prev => (prev[id] ? prev : { ...prev, [id]: Date.now() }))
    })
    const off3 = window.api.on('game:stopped', (updated) => {
      if (!updated || updated.id === undefined) return
      setRunningIds(prev => { const n = new Set(prev); n.delete(updated.id); return n })
      setRunningSince(prev => {
        if (!prev[updated.id]) return prev
        const next = { ...prev }
        delete next[updated.id]
        return next
      })
      setGames(prev => prev.map(g => g.id === updated.id ? updated : g))
    })
    const off4 = window.api.on('game:conflict', (conflicted) => {
      setGames(prev => {
        const exists = prev.some(g => g.id === conflicted.id)
        return exists ? prev.map(g => g.id === conflicted.id ? conflicted : g) : [...prev, conflicted]
      })
      setConflictGame(conflicted)
    })
    const off5 = window.api.on('cover-updated', ({ gameId, game, newPath }) => {
      if (!gameId) return
      setGames(prev => prev.map(g => {
        if (g.id !== gameId) return g
        if (game) return game
        return {
          ...g,
          cover_url: newPath ?? g.cover_url,
          updated_at: Math.floor(Date.now() / 1000),
        }
      }))
    })
    return () => { off1(); off2(); off3(); off4(); off5() }
  }, [])

  useEffect(() => {
    if (runningIds.size === 0) return
    const timer = setInterval(() => setPlaytimeTick(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [runningIds])

  useEffect(() => {
    localStorage.setItem('viewMode', viewMode)
  }, [viewMode])

  const sharedProps = {
    games,
    allGames:   games,
    categories,
    runningIds,
    runningSince,
    playtimeTick,
    setGames,
    refreshGames,
    onLaunch: async (id) => {
      const res = await window.api.invoke('game:launch', id)
      if (!res.success) alert(`Could not launch: ${res.error}`)
    },
    onStop: async (id) => {
      const res = await window.api.invoke('game:stop', id)
      if (!res.success) alert(`Could not stop: ${res.error}`)
    },
    onOpenConflict: (game) => setConflictGame(game),
    onGameUpdated:  (updated) => setGames(prev => prev.map(g => g.id === updated.id ? updated : g)),
    onDelete: async (id) => {
      await window.api.invoke('game:delete', id)
      setGames(prev => prev.filter(g => g.id !== id))
    },
    onTogglePin: async (id, nextPinned) => {
      const updated = await window.api.invoke('games:update', id, { isPinned: !!nextPinned })
      if (updated?.id !== undefined) {
        setGames(prev => prev.map(g => g.id === updated.id ? updated : g))
      }
    },
  }

  return (
    <HashRouter>
      <LibraryContent
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        platform={platform}
        setPlatform={setPlatform}
        sortBy={sortBy}
        setSortBy={setSortBy}
        viewMode={viewMode}
        setViewMode={setViewMode}
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        conflictGame={conflictGame}
        setConflictGame={setConflictGame}
        categories={categories}
        setCategories={setCategories}
        sharedProps={sharedProps}
      />
    </HashRouter>
  )
}

function LibraryContent({
  searchQuery,
  setSearchQuery,
  platform,
  setPlatform,
  sortBy,
  setSortBy,
  viewMode,
  setViewMode,
  showAddModal,
  setShowAddModal,
  conflictGame,
  setConflictGame,
  categories,
  setCategories,
  sharedProps,
}) {
  const location = useLocation()
  const runningIdSet = sharedProps?.runningIds instanceof Set ? sharedProps.runningIds : new Set()
  const runningSinceMap = sharedProps?.runningSince ?? {}
  const activePlaytimeTick = Number.isFinite(sharedProps?.playtimeTick) ? sharedProps.playtimeTick : Date.now()

  const sidebarFilter = useMemo(() => {
    const path = location.pathname
    if (path.startsWith('/category/')) {
      const id = path.split('/')[2] ?? ''
      return { type: 'category', id: String(id) }
    }
    if (path === '/steam') return { type: 'platform', value: 'steam' }
    if (path === '/epic') return { type: 'platform', value: 'epic' }
    if (path === '/custom') return { type: 'platform', value: 'custom' }
    return { type: 'all' }
  }, [location.pathname])

  const processedGames = useMemo(() => {
    const toTrackedSeconds = (raw) => {
      const value = Number(raw)
      if (!Number.isFinite(value) || value <= 0) return 0
      // Support either seconds or milliseconds without adding heavy parsing.
      return value > 31536000 ? Math.floor(value / 1000) : Math.floor(value)
    }

    const getLiveTotalPlaytime = (game) => {
      const base = toTrackedSeconds(game.total_playtime ?? game.totalPlayTime ?? 0)
      if (!runningIdSet.has(game.id)) return base
      const startedAt = runningSinceMap[game.id] ?? activePlaytimeTick
      const elapsed = Math.max(0, Math.floor((activePlaytimeTick - startedAt) / 1000))
      return base + elapsed
    }

    const getSizeValue = (game) => {
      const gbRaw =
        game.size ??
        game.size_gb ??
        game.sizeGb ??
        game.install_size ??
        game.installSize ??
        game.disk_size ??
        game.diskSize ??
        game.file_size ??
        game.fileSize
      const gbValue = Number(gbRaw)
      if (Number.isFinite(gbValue) && gbValue >= 0) return gbValue

      const bytesRaw =
        game.size_on_disk ??
        game.size_bytes ??
        game.sizeBytes
      const bytesValue = Number(bytesRaw)
      if (Number.isFinite(bytesValue) && bytesValue > 0) {
        return bytesValue / (1024 * 1024 * 1024)
      }

      return 0
    }

    const q = String(searchQuery ?? '').toLowerCase()
    const sourceGames = Array.isArray(sharedProps.games) ? sharedProps.games : []
    let list = sourceGames.filter((game) => {
      const title = String(game?.title ?? '').toLowerCase()
      return title.includes(q)
    })

    const isAllGamesSidebar = sidebarFilter.type === 'all'
    const normalizedSidebarPlatform = normalizePlatformValue(sidebarFilter.value)
    const normalizedSearchPlatform = normalizePlatformValue(platform)

    if (sidebarFilter.type === 'category') {
      list = list.filter(g => Array.isArray(g.tags) && g.tags.includes(sidebarFilter.id))
    } else if (!isAllGamesSidebar && sidebarFilter.type === 'platform') {
      list = list.filter(g => normalizePlatformValue(g.platform) === normalizedSidebarPlatform)
    }

    if (normalizedSearchPlatform !== 'all') {
      list = list.filter(g => normalizePlatformValue(g.platform) === normalizedSearchPlatform)
    }

    const sortGames = (items) => [...items].sort((a, b) => {
      const rawSortBy = sortBy ?? 'title'
      const sortKey = String(rawSortBy).trim().toLowerCase()
      
      // EXPLICIT SORT ROUTING WITH NUMERIC COERCION
      switch (sortKey) {
        case 'z-a':
          return b.title.localeCompare(a.title)
          
        case 'playtime':
          return getLiveTotalPlaytime(b) - getLiveTotalPlaytime(a)
          
        case 'least-played':
          return getLiveTotalPlaytime(a) - getLiveTotalPlaytime(b)
          
        case 'size-desc':
        case 'size-largest':
        case 'largest-size': {
          // CRITICAL: Force numeric comparison with explicit parseFloat coercion
          const sizeA = parseFloat(getSizeValue(a)) || 0
          const sizeB = parseFloat(getSizeValue(b)) || 0
          const hasSizeA = sizeA > 0
          const hasSizeB = sizeB > 0
          if (hasSizeA !== hasSizeB) return hasSizeA ? -1 : 1
          if (!hasSizeA && !hasSizeB) return a.title.localeCompare(b.title)
          return sizeB - sizeA  // Largest first
        }
          
        case 'size-asc':
        case 'size-smallest':
        case 'smallest-size': {
          // CRITICAL: Force numeric comparison with explicit parseFloat coercion
          const sizeA = parseFloat(getSizeValue(a)) || 0
          const sizeB = parseFloat(getSizeValue(b)) || 0
          const hasSizeA = sizeA > 0
          const hasSizeB = sizeB > 0
          if (hasSizeA !== hasSizeB) return hasSizeA ? -1 : 1
          if (!hasSizeA && !hasSizeB) return a.title.localeCompare(b.title)
          return sizeA - sizeB  // Smallest first
        }
          
        case 'unplayed': {
          const aPlaytime = getLiveTotalPlaytime(a)
          const bPlaytime = getLiveTotalPlaytime(b)
          const aUnplayed = aPlaytime <= 0 ? 0 : 1
          const bUnplayed = bPlaytime <= 0 ? 0 : 1
          if (aUnplayed !== bUnplayed) return aUnplayed - bUnplayed
          return a.title.localeCompare(b.title)
        }
          
        case 'lastplayed': {
          const aRaw = a.last_played ?? a.lastPlayed ?? null
          const bRaw = b.last_played ?? b.lastPlayed ?? null
          const aTs = aRaw ? new Date(aRaw).getTime() : 0
          const bTs = bRaw ? new Date(bRaw).getTime() : 0
          return bTs - aTs
        }
          
        default:
          // Default to A-Z (title)
          return a.title.localeCompare(b.title)
      }
    })

    const pinnedGames = []
    const unpinnedGames = []
    for (const game of list) {
      if (game.isPinned === true) pinnedGames.push(game)
      else unpinnedGames.push(game)
    }

    return [...sortGames(pinnedGames), ...sortGames(unpinnedGames)].map(game => ({
      ...game,
      display_playtime: getLiveTotalPlaytime(game),
    }))
  }, [sharedProps.games, searchQuery, sidebarFilter, platform, sortBy, runningIdSet, runningSinceMap, activePlaytimeTick])

  const viewProps = {
    ...sharedProps,
    games: processedGames,
    viewMode,
    sortBy,
  }

  return (
      <div className="flex flex-col h-screen overflow-hidden">
        <TitleBar />

        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            onAddGame={() => setShowAddModal(true)}
            categories={categories}
            onCategoryAdded={cat   => setCategories(prev => [...prev, cat])}
            onCategoryRenamed={cat => setCategories(prev => prev.map(c => c.id === cat.id ? cat : c))}
            onCategoryDeleted={id  => setCategories(prev => prev.filter(c => c.id !== id))}
          />

          <main className="flex-1 flex flex-col overflow-hidden">
            <SearchBar
              query={searchQuery}
              onQuery={setSearchQuery}
              platform={platform}
              onPlatform={setPlatform}
              sortBy={sortBy}
              onSortBy={setSortBy}
              viewMode={viewMode}
              onViewMode={setViewMode}
            />

            <div className="flex-1 overflow-y-auto p-6" data-library-scroll-root="true">
              <Routes>
                <Route path="/" element={<Navigate to="/all" replace />} />
                <Route path="/all"          element={<AllGames {...viewProps} label="All Games" />} />
                <Route path="/steam"        element={<AllGames {...viewProps} label="Steam Games" />} />
                <Route path="/epic"         element={<AllGames {...viewProps} label="Epic Games" />} />
                <Route path="/custom"       element={<AllGames {...viewProps} label="Manually Added" />} />
                <Route path="/category/:id" element={<CategoryView {...viewProps} />} />
                <Route path="/settings"     element={<Settings />} />
              </Routes>
            </div>
          </main>
        </div>

        {showAddModal && (
          <AddGameModal
            onClose={() => setShowAddModal(false)}
            onAdded={(newGame) => {
              sharedProps.setGames(prev => [...prev, newGame])
              setShowAddModal(false)
            }}
          />
        )}

        {conflictGame && (
          <ConflictModal
            game={conflictGame}
            onClose={() => setConflictGame(null)}
            onResolved={(updatedGame) => {
              sharedProps.onGameUpdated?.(updatedGame)
              setConflictGame(null)
            }}
          />
        )}
      </div>
  )
}