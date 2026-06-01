const { execFileSync } = require('child_process')

const GENERIC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#1f2937"/>
  <path d="M16 36l16-20 16 20-16 12z" fill="#38bdf8"/>
  <circle cx="32" cy="30" r="6" fill="#0f172a"/>
</svg>`

const GENERIC_ICON_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(GENERIC_SVG).toString('base64')}`

function getFallbackIconDataUri() {
  return GENERIC_ICON_DATA_URI
}

function extractExeIconSync(exePath) {
  if (!exePath) return null
  if (process.platform !== 'win32') return null

  const escaped = exePath.replace(/'/g, "''")
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    `$icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${escaped}')`,
    'if ($null -eq $icon) { return }',
    '$bmp = $icon.ToBitmap()',
    '$ms = New-Object System.IO.MemoryStream',
    '$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)',
    '[System.Convert]::ToBase64String($ms.ToArray())',
  ].join('; ')

  try {
    const base64 = execFileSync('powershell', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 4000,
    }).trim()

    if (!base64) return null
    return `data:image/png;base64,${base64}`
  } catch {
    return null
  }
}

module.exports = { extractExeIconSync, getFallbackIconDataUri }
