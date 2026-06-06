export default function SearchBar({ query, onQuery, platform, onPlatform, sortBy, onSortBy, viewMode = 'grid', onViewMode }) {
  const activePlatform = String(platform ?? 'ALL').toUpperCase()

  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b border-brand-border bg-brand-surface shrink-0">
      {/* Search input */}
      <div className="relative flex-1 max-w-sm">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted text-sm">🔍</span>
        <input
          type="text"
          placeholder="Search games…"
          value={query}
          onChange={e => onQuery(e.target.value)}
          className="w-full bg-brand-card border border-brand-border rounded-md pl-9 pr-3 py-1.5 text-sm text-brand-text placeholder-brand-muted focus:outline-none focus:border-brand-accent transition"
        />
      </div>

      {/* Platform filter */}
      <select
        value={activePlatform}
        onChange={e => onPlatform(e.target.value.toLowerCase())}
        className="bg-brand-card border border-brand-border rounded-md px-3 py-1.5 text-sm text-brand-text focus:outline-none focus:border-brand-accent transition cursor-pointer"
      >
        <option value="ALL">All Platforms</option>
        <option value="STEAM">Steam</option>
        <option value="EPIC">Epic</option>
        <option value="CUSTOM">Custom</option>
      </select>

      {/* Sort */}
      <select
        value={sortBy}
        onChange={e => onSortBy(e.target.value)}
        className="bg-brand-card border border-brand-border rounded-md px-3 py-1.5 text-sm text-brand-text focus:outline-none focus:border-brand-accent transition cursor-pointer"
      >
        <option value="title">Sort: A–Z</option>
        <option value="playtime">Sort: Most Played</option>
        <option value="lastPlayed">Sort: Recently Played</option>
        <option value="z-a">Sort: Z-A</option>
        <option value="least-played">Sort: Least Played</option>
        <option value="size-desc">Sort: Size (Largest)</option>
        <option value="size-asc">Sort: Size (Smallest)</option>
        <option value="unplayed">Sort: Unplayed First</option>
      </select>

      {/* View mode */}
      <div className="inline-flex border border-brand-border rounded-md overflow-hidden">
        <button
          type="button"
          onClick={() => onViewMode?.('grid')}
          className={`px-3 py-1.5 text-sm transition ${viewMode === 'grid' ? 'bg-brand-accent text-white' : 'bg-brand-card text-brand-muted hover:text-brand-text'}`}
          title="Grid view"
        >
          ▦
        </button>
        <button
          type="button"
          onClick={() => onViewMode?.('list')}
          className={`px-3 py-1.5 text-sm transition border-l border-brand-border ${viewMode === 'list' ? 'bg-brand-accent text-white' : 'bg-brand-card text-brand-muted hover:text-brand-text'}`}
          title="List view"
        >
          ☰
        </button>
      </div>
    </div>
  )
}
