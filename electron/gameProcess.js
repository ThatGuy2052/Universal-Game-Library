/**
 * gameProcess.js — Spawns game processes, tracks lifetime, and accumulates playtime.
 */
const { spawn, exec } = require('child_process')
const fs        = require('fs')
const path      = require('path')
const db        = require('./database')

let mainWindow = null

const STEAM_POLL_MS = 7000
const STEAM_BOOT_TIMEOUT_MS = 25000
const STEAM_GAME_START_TIMEOUT_MS = 120000
const EPIC_GAME_START_TIMEOUT_MS = 120000

/** Map<gameId, { process?, startTime?, interval?, launchedAt?, steamNeedles? }> */
const running = new Map()

function setWindow(win) { mainWindow = win }

function withResolvedCover(game) {
  if (!game) return game
  const coverUrl = game.cover_url || game.cover_local || null
  return { ...game, coverUrl }
}

function isRunning(id) {
  return running.has(id)
}

async function stop(id) {
  const entry = running.get(id)
  if (!entry) return { success: false, error: 'Game is not running' }

  const game = db.getGameById(id)
  if (!game) {
    cleanup(id, entry.startTime ?? null)
    return { success: false, error: 'Game not found' }
  }

  try {
    if (entry.process?.pid) {
      await killProcessTree(entry.process.pid)
      cleanup(id, entry.startTime ?? null)
      return { success: true }
    }

    const names = []
    if (entry.activeProcessName) names.push(entry.activeProcessName)
    for (const n of entry.steamNeedles ?? []) names.push(n)

    if (names.length > 0) {
      await killByNames(names)
    }

    cleanup(id, entry.startTime ?? null)
    return { success: true }
  } catch (err) {
    cleanup(id, entry.startTime ?? null)
    return { success: false, error: err.message }
  }
}

async function launch(id) {
  if (running.has(id)) {
    return { success: false, error: 'Already running' }
  }

  const game = db.getGameById(id)
  if (!game) return { success: false, error: 'Game not found' }

  const isSteamGame = String(game.platform ?? '').toLowerCase() === 'steam' || !!game.steam_appid
  const isEpicGame = String(game.platform ?? '').toLowerCase() === 'epic' || !!game.epic_appname
  if (!isSteamGame && !isEpicGame && !game.exe_path) return { success: false, error: 'No executable path set' }

  if (isSteamGame) {
    const appId = String(game.steam_appid ?? '').trim()
    if (!appId) return { success: false, error: 'Missing Steam AppID' }

    try {
      await ensureSteamClientRunning()
      await launchSteamUrl(appId)
      startSteamTracking(id, game)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  if (isEpicGame) {
    const appName = String(game.epic_appname ?? '').trim()
    if (!appName) return { success: false, error: 'Missing Epic AppName' }

    try {
      await launchEpicUrl(appName)
      startEpicTracking(id, game)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  let child
  let startTime = null
  try {
    if (game.launch_steam_with_game || game.launchSteamWithGame) {
      await ensureSteamClientRunning()
      await launchSteamMain()
    }

    const exePath = game.exe_path
    const cwd     = path.dirname(exePath)

    if (process.platform === 'win32') {
      // Use shell: true so Windows can find .exe files with spaces in paths
      child = spawn(`"${exePath}"`, [], {
        cwd,
        detached: true,
        shell: true,
        stdio: 'ignore',
      })
    } else {
      child = spawn(exePath, [], {
        cwd,
        detached: true,
        stdio: 'ignore',
      })
    }

    startTime = Date.now()
    running.set(id, { process: child, startTime, launchedAt: startTime })
    child.unref()

    // Notify renderer that the game launched
    mainWindow?.webContents.send('game:launched', { id })

    child.on('error', err => {
      console.error(`[GameProcess] Error launching game ${id}:`, err.message)
      cleanup(id, startTime)
    })

    child.on('close', () => {
      cleanup(id, startTime)
    })

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function cleanup(id, startTime) {
  const entry = running.get(id)
  if (!entry) return
  running.delete(id)
  if (entry.interval) clearInterval(entry.interval)

  const effectiveStart = startTime ?? entry.startTime
  if (!effectiveStart) {
    mainWindow?.webContents.send('game:stopped', withResolvedCover(db.getGameById(id)))
    return
  }

  const elapsed = Math.floor((Date.now() - effectiveStart) / 1000)  // seconds
  if (elapsed <= 0) {
    mainWindow?.webContents.send('game:stopped', withResolvedCover(db.getGameById(id)))
    return
  }

  const game = db.getGameById(id)
  if (!game) return

  const newTotal    = (game.total_playtime ?? 0) + elapsed
  const lastPlayed  = Math.floor(Date.now() / 1000)

  const patch = { total_playtime: newTotal, last_played: lastPlayed }
  if (game.cover_url !== undefined) patch.cover_url = game.cover_url
  if (game.cover_local !== undefined) patch.cover_local = game.cover_local

  db.updateGame(id, patch)
  db.saveNow?.()

  const updated = db.getGameById(id)
  mainWindow?.webContents.send('game:stopped', withResolvedCover(updated))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function execAsync(command) {
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.trim() || err.message))
      resolve(stdout ?? '')
    })
  })
}

async function getActiveProcessNames() {
  try {
    if (process.platform === 'win32') {
      const output = await execAsync('tasklist /FO CSV /NH')
      return output
        .split(/\r?\n/)
        .map(line => {
          const m = line.match(/^"([^"]+)"/)
          return m ? m[1].toLowerCase() : null
        })
        .filter(Boolean)
    }

    const output = await execAsync('ps -A -o comm=')
    return output
      .split(/\r?\n/)
      .map(line => path.basename(line.trim()).toLowerCase())
      .filter(Boolean)
  } catch {
    return []
  }
}

function hasSteamClient(processNames) {
  if (process.platform === 'win32') return processNames.includes('steam.exe')
  return processNames.includes('steam')
}

async function isSteamClientRunning() {
  const names = await getActiveProcessNames()
  return hasSteamClient(names)
}

async function getSteamExeFromRegistry() {
  if (process.platform !== 'win32') return null
  try {
    const output = await execAsync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamExe')
    const match = output.match(/SteamExe\s+REG_\w+\s+(.+)$/m)
    if (!match) return null
    const candidate = match[1].trim()
    return fs.existsSync(candidate) ? candidate : null
  } catch {
    return null
  }
}

async function resolveSteamClientPath() {
  if (process.platform === 'win32') {
    const fromRegistry = await getSteamExeFromRegistry()
    if (fromRegistry) return fromRegistry
    const defaults = [
      'C:\\Program Files (x86)\\Steam\\steam.exe',
      'C:\\Program Files\\Steam\\steam.exe',
    ]
    return defaults.find(p => fs.existsSync(p)) ?? null
  }
  return null
}

async function ensureSteamClientRunning() {
  if (await isSteamClientRunning()) return

  if (process.platform === 'win32') {
    const steamExe = await resolveSteamClientPath()
    if (!steamExe) throw new Error('Steam client not found')
    const steamProc = spawn(steamExe, [], { detached: true, stdio: 'ignore' })
    steamProc.unref()
  } else if (process.platform === 'darwin') {
    await execAsync('open -a Steam')
  } else {
    const steamProc = spawn('steam', [], { detached: true, stdio: 'ignore' })
    steamProc.unref()
  }

  const deadline = Date.now() + STEAM_BOOT_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(1000)
    if (await isSteamClientRunning()) return
  }
  throw new Error('Steam client did not initialize in time')
}

async function launchSteamUrl(appId) {
  const url = `steam://run/${appId}`
  if (process.platform === 'win32') {
    await execAsync(`cmd /c start "" "${url}"`)
    return
  }
  if (process.platform === 'darwin') {
    await execAsync(`open "${url}"`)
    return
  }
  await execAsync(`xdg-open "${url}"`)
}

async function launchSteamMain() {
  const url = 'steam://open/main'
  if (process.platform === 'win32') {
    await execAsync(`cmd /c start "" "${url}"`)
    return
  }
  if (process.platform === 'darwin') {
    await execAsync(`open "${url}"`)
    return
  }
  await execAsync(`xdg-open "${url}"`)
}

async function launchEpicUrl(appName) {
  const url = `com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=launch&silent=true`
  if (process.platform === 'win32') {
    await execAsync(`cmd /c start "" "${url}"`)
    return
  }
  if (process.platform === 'darwin') {
    await execAsync(`open "${url}"`)
    return
  }
  await execAsync(`xdg-open "${url}"`)
}

async function killProcessTree(pid) {
  if (process.platform === 'win32') {
    await execAsync(`taskkill /PID ${pid} /T /F`)
    return
  }

  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    process.kill(pid, 'SIGKILL')
  }
}

async function killByNames(names) {
  const unique = Array.from(new Set(names.filter(Boolean)))
  if (unique.length === 0) return

  if (process.platform === 'win32') {
    for (const raw of unique) {
      const base = String(raw).toLowerCase().replace(/[^a-z0-9_.-]+/g, '')
      if (!base) continue
      const image = base.endsWith('.exe') ? base : `${base}.exe`
      try { await execAsync(`taskkill /IM "${image}" /T /F`) } catch { /* best effort */ }
    }
    return
  }

  for (const raw of unique) {
    const token = String(raw).replace(/[^a-zA-Z0-9_.-]+/g, '')
    if (!token) continue
    try { await execAsync(`pkill -f "${token}"`) } catch { /* best effort */ }
  }
}

function getSteamNeedles(game) {
  const needles = new Set()

  if (game.exe_path) {
    const folder = path.basename(game.exe_path)
    if (folder) needles.add(folder.toLowerCase())
    const exeStem = path.basename(game.exe_path, path.extname(game.exe_path))
    if (exeStem) needles.add(exeStem.toLowerCase())
  }

  if (game.title) {
    const titleStem = game.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .slice(0, 3)
    if (titleStem.length) needles.add(titleStem.join(''))
  }

  // Never track steam client itself as the game process.
  needles.delete('steam')
  needles.delete('steam.exe')

  return Array.from(needles)
    .map(n => n.toLowerCase().replace(/[^a-z0-9]+/g, ''))
    .filter(Boolean)
}

function findSteamProcessName(processNames, needles) {
  if (!needles.length) return null
  for (const name of processNames) {
    const normalized = name.toLowerCase().replace(/\.exe$/i, '').replace(/[^a-z0-9]+/g, '')
    if (needles.some(n => normalized.includes(n))) return name
  }
  return null
}

function startSteamTracking(id, game) {
  const state = {
    startTime: null,
    launchedAt: Date.now(),
    steamNeedles: getSteamNeedles(game),
    interval: null,
  }
  running.set(id, state)

  const poll = async () => {
    const current = running.get(id)
    if (!current) return

    const names = await getActiveProcessNames()
    const detectedName = findSteamProcessName(names, current.steamNeedles)

    if (detectedName) {
      if (!current.startTime) {
        current.startTime = Date.now()
        mainWindow?.webContents.send('game:launched', { id })
      }
      current.activeProcessName = detectedName
      running.set(id, current)
      return
    }

    if (!current.startTime) {
      if (Date.now() - current.launchedAt > STEAM_GAME_START_TIMEOUT_MS) {
        cleanup(id, null)
      }
      return
    }

    cleanup(id, current.startTime)
  }

  state.interval = setInterval(() => {
    poll().catch(() => { /* keep polling on transient failures */ })
  }, STEAM_POLL_MS)

  // Kick once immediately so fast launches are detected without waiting 7s.
  poll().catch(() => { /* keep polling on transient failures */ })
}

function getEpicNeedles(game) {
  const needles = new Set()

  if (game.exe_path) {
    const exeStem = path.basename(game.exe_path, path.extname(game.exe_path))
    if (exeStem) needles.add(exeStem.toLowerCase())
  }

  if (game.epic_appname) {
    needles.add(String(game.epic_appname).toLowerCase().replace(/[^a-z0-9]+/g, ''))
  }

  if (game.title) {
    const titleStem = game.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .trim()
    if (titleStem) needles.add(titleStem)
  }

  needles.delete('epicgameslauncher')
  needles.delete('epicgameslauncher.exe')
  needles.delete('epicwebhelper')
  needles.delete('epicwebhelper.exe')

  return Array.from(needles)
    .map(n => n.toLowerCase().replace(/[^a-z0-9]+/g, ''))
    .filter(Boolean)
}

function startEpicTracking(id, game) {
  const state = {
    startTime: null,
    launchedAt: Date.now(),
    steamNeedles: getEpicNeedles(game),
    interval: null,
  }
  running.set(id, state)

  const poll = async () => {
    const current = running.get(id)
    if (!current) return

    const names = await getActiveProcessNames()
    const detectedName = findSteamProcessName(names, current.steamNeedles)

    if (detectedName) {
      if (!current.startTime) {
        current.startTime = Date.now()
        mainWindow?.webContents.send('game:launched', { id })
      }
      current.activeProcessName = detectedName
      running.set(id, current)
      return
    }

    if (!current.startTime) {
      if (Date.now() - current.launchedAt > EPIC_GAME_START_TIMEOUT_MS) {
        cleanup(id, null)
      }
      return
    }

    cleanup(id, current.startTime)
  }

  state.interval = setInterval(() => {
    poll().catch(() => { /* keep polling on transient failures */ })
  }, STEAM_POLL_MS)

  poll().catch(() => { /* keep polling on transient failures */ })
}

module.exports = { launch, stop, isRunning, setWindow }
