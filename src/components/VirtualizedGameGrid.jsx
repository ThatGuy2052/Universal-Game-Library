import { useEffect, useMemo, useRef, useState } from 'react'

const OVERSCAN_ROWS = 6
const DEFAULT_ROW_HEIGHT = 316
const MIN_VIEWPORT_HEIGHT = 480

function getCols(width) {
  if (width >= 1280) return 6
  if (width >= 1024) return 5
  if (width >= 768) return 4
  if (width >= 640) return 3
  return 2
}

export default function VirtualizedGameGrid({
  games,
  renderItem,
  rowHeight = DEFAULT_ROW_HEIGHT,
}) {
  const hostRef = useRef(null)
  const [width, setWidth] = useState(0)
  const [localScrollTop, setLocalScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(MIN_VIEWPORT_HEIGHT)

  const safeRowHeight = Math.max(240, Number(rowHeight) || DEFAULT_ROW_HEIGHT)

  const cols = getCols(width)
  const rowCount = Math.ceil(games.length / cols)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Establish explicit initial dimensions to avoid 0px virtualization collapse.
    setWidth(host.clientWidth || 1200)

    const resizeObs = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect?.width ?? host.clientWidth
      setWidth(nextWidth || host.clientWidth || 1200)
    })
    resizeObs.observe(host)

    return () => resizeObs.disconnect()
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const root = host.closest('[data-library-scroll-root]')
    const scrollEl = root || window

    const update = () => {
      if (root) {
        const rootRect = root.getBoundingClientRect()
        const hostRect = host.getBoundingClientRect()
        const hostTopInRoot = hostRect.top - rootRect.top + root.scrollTop
        const nextLocal = Math.max(0, root.scrollTop - hostTopInRoot)
        setLocalScrollTop(nextLocal)
        setViewportHeight(Math.max(MIN_VIEWPORT_HEIGHT, root.clientHeight || MIN_VIEWPORT_HEIGHT))
      } else {
        const hostTopInPage = host.getBoundingClientRect().top + window.scrollY
        const nextLocal = Math.max(0, window.scrollY - hostTopInPage)
        setLocalScrollTop(nextLocal)
        setViewportHeight(Math.max(MIN_VIEWPORT_HEIGHT, window.innerHeight || MIN_VIEWPORT_HEIGHT))
      }
    }

    update()
    scrollEl.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    return () => {
      scrollEl.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  const { startIndex, endIndex, topOffset, totalHeight } = useMemo(() => {
    if (rowCount === 0) {
      return { startIndex: 0, endIndex: 0, topOffset: 0, totalHeight: safeRowHeight }
    }

    const rawStart = Math.floor(localScrollTop / safeRowHeight) - OVERSCAN_ROWS
    const startRow = Math.max(0, Math.min(rowCount - 1, rawStart))
    const rawEnd = Math.ceil((localScrollTop + viewportHeight) / safeRowHeight) + OVERSCAN_ROWS
    const endRow = Math.max(startRow + 1, Math.min(rowCount, rawEnd))

    return {
      startIndex: startRow * cols,
      endIndex: endRow * cols,
      topOffset: startRow * safeRowHeight,
      totalHeight: rowCount * safeRowHeight,
    }
  }, [cols, rowCount, safeRowHeight, localScrollTop, viewportHeight])

  const visible = games.slice(startIndex, endIndex)

  return (
    <div ref={hostRef} className="relative" style={{ height: `${Math.max(totalHeight, safeRowHeight)}px`, minHeight: `${safeRowHeight}px` }}>
      <div className="absolute inset-x-0" style={{ top: `${topOffset}px` }}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {visible.map(game => renderItem(game))}
        </div>
      </div>
    </div>
  )
}
