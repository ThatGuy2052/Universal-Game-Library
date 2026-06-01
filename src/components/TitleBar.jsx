/** Custom frameless window title bar with drag region and window controls */
export default function TitleBar() {
  return (
    <div className="drag-region h-9 flex items-center justify-between bg-brand-surface border-b border-brand-border select-none shrink-0 px-4">
      <span className="text-sm font-semibold text-brand-text tracking-wide no-drag pointer-events-none">
        🎮 Universal Game Library
      </span>
      <div className="no-drag flex items-center gap-1">
        <button
          onClick={() => window.api.send('window:minimize')}
          className="w-7 h-5 rounded text-brand-muted hover:bg-brand-border hover:text-brand-text transition text-xs"
          aria-label="Minimise"
        >─</button>
        <button
          onClick={() => window.api.send('window:maximize')}
          className="w-7 h-5 rounded text-brand-muted hover:bg-brand-border hover:text-brand-text transition text-xs"
          aria-label="Maximise"
        >□</button>
        <button
          onClick={() => window.api.send('window:close')}
          className="w-7 h-5 rounded text-brand-muted hover:bg-brand-red hover:text-white transition text-xs"
          aria-label="Close"
        >✕</button>
      </div>
    </div>
  )
}
