import GameCard from '../components/GameCard'
import GameListRow from '../components/GameListRow'

/**
 * AllGames — renders the already processed list from App.jsx.
 */
export default function AllGames({ games, categories, runningIds, onLaunch, onStop, onDelete, onOpenConflict, onGameUpdated, viewMode = 'grid', sortBy, label = 'All Games' }) {
  const filteredGames = games

  const handleDelete = onDelete

  if (filteredGames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-brand-muted gap-3">
        <span className="text-5xl">🎮</span>
        <p className="text-lg font-medium">No games found</p>
        <p className="text-sm">Add a game manually or drop one into the DropZone folder.</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-brand-muted mb-4 uppercase tracking-wider">
        {label} · {filteredGames.length} game{filteredGames.length !== 1 ? 's' : ''}
      </p>
      {viewMode === 'list' ? (
        <div className="space-y-2">
          {filteredGames.map(game => (
            <GameListRow
              key={game.id}
              game={game}
              isRunning={runningIds.has(game.id)}
              onLaunch={onLaunch}
              onStop={onStop}
              onDelete={handleDelete}
              onOpenConflict={onOpenConflict}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 p-6">
          {filteredGames.map(game => (
            <GameCard
              key={game.id}
              game={game}
              isRunning={runningIds.has(game.id)}
              onLaunch={onLaunch}
              onStop={onStop}
              onDelete={handleDelete}
              onOpenConflict={onOpenConflict}
              categories={categories}
              onGameUpdated={onGameUpdated}
              sortBy={sortBy}
            />
          ))}
        </div>
      )}
    </div>
  )
}

