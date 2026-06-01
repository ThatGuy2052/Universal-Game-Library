/**
 * database.js — Lightweight JSON-based game store.
 * Uses atomic write (write-to-temp-then-rename) to prevent corruption.
 *
 * Schema (library.json):
 * {
 *   nextId:       number,          — auto-increment counter for games
 *   nextCatId:    number,          — auto-increment counter for categories
 *   games:        Game[],
 *   categories:   Category[]       — user-created collections
 * }
 *
 * Category: { id: number, name: string, icon?: string }
 * Game.tags: string[]              — array of category IDs (as strings) the game belongs to
 */
const path  = require('path')
const fs    = require('fs')
const { app } = require('electron')

let dbPath = null
let data   = null

function normalizeSizeGb(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return fallback
  return Math.round(numeric * 100) / 100
}

function bytesToGb(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return 0
  return Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100
}

// ───────────────────────────────────────────────────────────────────────────
function init() {
  let needsPersist = false
  const dir = path.join(app.getPath('appData'), 'GameLibraryManager')
  fs.mkdirSync(dir, { recursive: true })
  dbPath = path.join(dir, 'library.json')
  const userDataDir = path.normalize(app.getPath('userData')).replace(/\\/g, '/')
  const coverCacheDir = path.normalize(path.join(app.getPath('appData'), 'GameLibraryManager', 'CoverCache')).replace(/\\/g, '/')

  if (fs.existsSync(dbPath)) {
    try {
      data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
    } catch {
      data = null
    }
  }

  if (!data || !Array.isArray(data.games)) {
    data = { nextId: 1, nextCatId: 1, games: [], categories: [] }
    needsPersist = true
    persist()
  }

  // Migrate older stores that predate categories
  if (!Array.isArray(data.categories)) { data.categories = []; needsPersist = true }
  if (typeof data.nextCatId !== 'number') { data.nextCatId = 1; needsPersist = true }

  function toCustomCoverProtocol(maybePath) {
    if (typeof maybePath !== 'string' || maybePath.length === 0) return null
    if (maybePath.startsWith('custom-cover://')) return maybePath

    const unwrapped = maybePath.replace(/^file:\/\//i, '')
    const normalized = path.normalize(unwrapped).replace(/\\/g, '/')
    const lower = normalized.toLowerCase()
    const userDataLower = userDataDir.toLowerCase()
    const coverCacheLower = coverCacheDir.toLowerCase()

    const hasLegacySignature =
      lower.includes('appdata/roaming') ||
      lower.includes('/custom_covers/') ||
      lower.includes('/covercache/') ||
      lower.startsWith(userDataLower + '/') ||
      lower.startsWith(coverCacheLower + '/')
    if (!hasLegacySignature) return null

    let relative = null
    if (lower.startsWith(userDataLower + '/')) {
      relative = normalized.slice(userDataDir.length + 1)
    } else if (lower.startsWith(coverCacheLower + '/')) {
      const tail = normalized.slice(coverCacheDir.length + 1).replace(/^\/+/, '')
      relative = `CoverCache/${tail}`
    } else {
      const marker = '/custom_covers/'
      const markerIndex = lower.lastIndexOf(marker)
      if (markerIndex !== -1) {
        relative = normalized.slice(markerIndex + 1) // keep custom_covers/...
      } else {
        const cacheMarker = '/covercache/'
        const cacheIndex = lower.lastIndexOf(cacheMarker)
        if (cacheIndex !== -1) {
          const tail = normalized.slice(cacheIndex + cacheMarker.length)
          relative = `CoverCache/${tail}`
        }
      }
    }

    if (!relative) return null
    relative = relative.replace(/^\/+/, '')
    if (!relative.toLowerCase().startsWith('custom_covers/') && !relative.toLowerCase().startsWith('covercache/')) {
      relative = `custom_covers/${relative}`
    }
    return `custom-cover://${encodeURI(relative)}`
  }

  // Ensure every game has a tags array
  for (const g of data.games) {
    if (!Array.isArray(g.tags)) { g.tags = []; needsPersist = true }
    if (g.exe_icon === undefined) { g.exe_icon = null; needsPersist = true }
    if (g.updated_at === undefined) { g.updated_at = g.created_at ?? Math.floor(Date.now() / 1000); needsPersist = true }
    if (g.launch_steam_with_game === undefined) { g.launch_steam_with_game = false; needsPersist = true }

    const inferredSizeGb =
      g.size ??
      g.size_gb ??
      g.sizeGb ??
      g.install_size ??
      g.installSize ??
      g.disk_size ??
      g.diskSize ??
      g.file_size ??
      g.fileSize ??
      (g.size_on_disk !== undefined ? bytesToGb(g.size_on_disk) : 0)
    const normalizedSize = normalizeSizeGb(inferredSizeGb, 0)
    if (g.size !== normalizedSize) {
      g.size = normalizedSize
      needsPersist = true
    }

    // Keep heavy image payloads out of startup DB churn when local cached path exists.
    if (g.cover_local && typeof g.cover_url === 'string' && g.cover_url.startsWith('data:')) {
      g.cover_url = null
      needsPersist = true
    }

    const migratedCoverUrl = toCustomCoverProtocol(g.cover_url)
    if (migratedCoverUrl && migratedCoverUrl !== g.cover_url) {
      g.cover_url = migratedCoverUrl
      needsPersist = true
    }

    const migratedCoverLocal = toCustomCoverProtocol(g.cover_local)
    if (migratedCoverLocal && migratedCoverLocal !== g.cover_url) {
      g.cover_url = migratedCoverLocal
      needsPersist = true
    }
  }
  if (needsPersist) persist()
}

function persist() {
  const tmp = dbPath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmp, dbPath)
}

function saveNow() {
  persist()
}

// ═══════════════════════════════════════════════════════════════════════════
//  GAMES
// ═══════════════════════════════════════════════════════════════════════════
function getAllGames() {
  return [...data.games].sort((a, b) => a.title.localeCompare(b.title))
}

function getGameById(id) {
  return data.games.find(g => g.id === id) ?? null
}

function addGame(game) {
  const inferredSizeGb =
    game.size ??
    game.size_gb ??
    game.sizeGb ??
    game.install_size ??
    game.installSize ??
    game.disk_size ??
    game.diskSize ??
    game.file_size ??
    game.fileSize ??
    (game.size_on_disk !== undefined ? bytesToGb(game.size_on_disk) : 0)

  const newGame = {
    id:             data.nextId++,
    title:          game.title          ?? 'Unknown',
    exe_path:       game.exe_path       ?? null,
    total_playtime: 0,
    last_played:    null,
    platform:       String(game.platform ?? 'custom').toLowerCase(),
    cover_url:      game.cover_url      ?? null,
    cover_local:    game.cover_local    ?? null,
    exe_icon:       game.exe_icon       ?? null,
    install_status: game.install_status ?? 'installed',
    steam_appid:    game.steam_appid    ?? null,
    conflict_exes:  Array.isArray(game.conflict_exes) ? game.conflict_exes : [],
    source_dir:     game.source_dir     ?? null,
    tags:           Array.isArray(game.tags) ? game.tags : [],
    launch_steam_with_game: !!game.launch_steam_with_game,
    size:           normalizeSizeGb(inferredSizeGb, 0),
    created_at:     Math.floor(Date.now() / 1000),
    updated_at:     Math.floor(Date.now() / 1000),
  }
  data.games.push(newGame)
  persist()
  return { ...newGame }
}

function updateGame(id, fields) {
  const ALLOWED = [
    'title', 'exe_path', 'total_playtime', 'last_played',
    'platform', 'cover_url', 'cover_local', 'exe_icon', 'install_status', 'steam_appid',
    'conflict_exes', 'source_dir', 'tags', 'updated_at', 'launch_steam_with_game', 'size',
  ]
  const idx = data.games.findIndex(g => g.id === id)
  if (idx === -1) return null

  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED.includes(k)) continue
    if (k === 'size') {
      data.games[idx][k] = normalizeSizeGb(v, data.games[idx].size ?? 0)
      continue
    }
    data.games[idx][k] = v
  }
  data.games[idx].updated_at = Math.floor(Date.now() / 1000)
  persist()
  return { ...data.games[idx] }
}

function deleteGame(id) {
  data.games = data.games.filter(g => g.id !== id)
  persist()
}

// ═══════════════════════════════════════════════════════════════════════════
//  CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════
function getAllCategories() {
  return [...data.categories]
}

function addCategory(name, icon = '🗂') {
  const cat = { id: data.nextCatId++, name: name.trim(), icon }
  data.categories.push(cat)
  persist()
  return { ...cat }
}

function updateCategory(id, fields) {
  const idx = data.categories.findIndex(c => c.id === id)
  if (idx === -1) return null
  if (fields.name !== undefined) data.categories[idx].name = fields.name.trim()
  if (fields.icon !== undefined) data.categories[idx].icon = fields.icon
  persist()
  return { ...data.categories[idx] }
}

function deleteCategory(id) {
  data.categories = data.categories.filter(c => c.id !== id)
  // Remove this category id from every game's tags
  const catStr = String(id)
  for (const g of data.games) {
    if (Array.isArray(g.tags)) {
      g.tags = g.tags.filter(t => t !== catStr)
    }
  }
  persist()
}

/**
 * Set the complete tags array for a game.
 * tagIds: string[] of category ids.
 */
function setGameTags(gameId, tagIds) {
  return updateGame(gameId, { tags: tagIds.map(String) })
}

module.exports = {
  init,
  saveNow,
  getAllGames, getGameById, addGame, updateGame, deleteGame,
  getAllCategories, addCategory, updateCategory, deleteCategory, setGameTags,
}

