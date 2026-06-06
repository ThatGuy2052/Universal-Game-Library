const fs = require('fs')
const path = require('path')

const WINDOWS_LAUNCHER_INSTALLED = 'C:\\ProgramData\\Epic\\UnrealEngineLauncher\\LauncherInstalled.dat'
const WINDOWS_MANIFESTS_DIR = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function getManifestMetadataMap(manifestsDir) {
  const byAppName = new Map()
  if (!fs.existsSync(manifestsDir)) return byAppName

  let entries = []
  try {
    entries = fs.readdirSync(manifestsDir)
  } catch (error) {
    console.error('Failed to read Epic Manifests directory:', error)
    return byAppName
  }

  for (const entry of entries) {
    if (!entry?.toLowerCase?.().endsWith('.item')) continue
    const fullPath = path.join(manifestsDir, entry)
    const parsed = readJsonSafe(fullPath)
    if (!parsed || typeof parsed !== 'object') continue

    const appName = String(parsed?.AppName ?? '').trim()
    if (!appName) continue

    const displayName = String(parsed?.DisplayName ?? parsed?.AppName ?? '').trim() || appName
    byAppName.set(appName.toLowerCase(), { displayName })
  }

  return byAppName
}

function resolveExecutablePath(installLocation, installEntry) {
  try {
    const launchExecutable = String(installEntry?.LaunchExecutable ?? '').trim()
    if (launchExecutable) {
      const candidate = path.join(installLocation, launchExecutable)
      if (fs.existsSync(candidate)) return candidate
    }

    const exeCandidates = collectExeCandidates(installLocation, 2)
    if (exeCandidates.length === 0) return null

    const appName = String(installEntry?.AppName ?? '').trim().toLowerCase()
    const installFolder = path.basename(installLocation).toLowerCase()
    const preferred = exeCandidates.find((candidate) => {
      const candidateName = path.basename(candidate, path.extname(candidate)).toLowerCase()
      return candidateName === installFolder || candidateName.includes(installFolder) || candidateName === appName || candidateName.includes(appName)
    })

    return preferred ?? exeCandidates[0]
  } catch (error) {
    console.error('Failed to resolve Epic executable path:', error)
    return null
  }
}

function collectExeCandidates(dirPath, depth = 2) {
  const results = []
  if (!dirPath || depth < 0 || !fs.existsSync(dirPath)) return results

  let entries = []
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
      results.push(fullPath)
      continue
    }
    if (entry.isDirectory() && depth > 0) {
      results.push(...collectExeCandidates(fullPath, depth - 1))
    }
  }

  return results
}

function scan() {
  try {
    if (process.platform !== 'win32') return []

    // Explicit existence check for LauncherInstalled.dat
    if (!fs.existsSync(WINDOWS_LAUNCHER_INSTALLED)) {
      return []
    }

    const launcherData = readJsonSafe(WINDOWS_LAUNCHER_INSTALLED)
    const installationList = Array.isArray(launcherData?.InstallationList) ? launcherData.InstallationList : []
    if (installationList.length === 0) return []

    // Explicit existence check for Manifests directory
    if (!fs.existsSync(WINDOWS_MANIFESTS_DIR)) {
      return []
    }

    const metadataByApp = getManifestMetadataMap(WINDOWS_MANIFESTS_DIR)
    let allEpicGames = []

    for (const item of installationList) {
      const appName = String(item?.AppName ?? '').trim()
      const installLocationRaw = String(item?.InstallLocation ?? '').trim()
      if (!appName || !installLocationRaw) continue

      // Keep path allocation local per loop iteration so one entry cannot overwrite another.
      const appInstallLocation = path.normalize(installLocationRaw)
      if (!fs.existsSync(appInstallLocation)) continue

      const metadata = metadataByApp.get(appName.toLowerCase())
      const displayName = metadata?.displayName || appName
      const exePath = resolveExecutablePath(appInstallLocation, item)

      allEpicGames.push({
        id: appName,
        AppName: appName,
        InstallLocation: appInstallLocation,
        epic_appname: appName,
        title: displayName,
        platform: 'epic',
        install_status: 'installed',
        source_dir: appInstallLocation,
        exe_path: exePath,
        cover_url: null,
      })
    }

    // Enforce unique install paths / ids so duplicate timeout scans do not fan out.
    allEpicGames = allEpicGames.filter((game, index, self) =>
      index === self.findIndex((g) =>
        String(g?.InstallLocation ?? '').toLowerCase() === String(game?.InstallLocation ?? '').toLowerCase() ||
        String(g?.id ?? '').toLowerCase() === String(game?.id ?? '').toLowerCase()
      )
    )

    return allEpicGames
  } catch (error) {
    console.error('Epic Scan Failed:', error)
    return []
  }
}

module.exports = { scan }
