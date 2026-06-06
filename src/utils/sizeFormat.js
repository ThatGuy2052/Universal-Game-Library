export function getGameSizeGb(game) {
  const timeoutMarker = String(game?.size ?? '').trim().toUpperCase()
  if (timeoutMarker === 'TIMEOUT') return 'TIMEOUT'

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

export function formatGameSize(gbValue) {
  if (String(gbValue ?? '').trim().toUpperCase() === 'TIMEOUT') return 'N/A'
  const value = Number(gbValue)
  if (!Number.isFinite(value) || value <= 0) return 'N/A'
  if (value >= 1) return `${value.toFixed(1)} GB`
  return `${Math.round(value * 1024)} MB`
}
