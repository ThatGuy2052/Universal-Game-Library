import { useParams } from 'react-router-dom'
import GameCard from '../components/GameCard'
import GameListRow from '../components/GameListRow'

/**
 * CategoryView — shows all games tagged with a specific custom category.
 * The category id comes from the URL param.
 */
export default function CategoryView({ games, categories, runningIds, onLaunch, onStop, onDelete, onOpenConflict, onGameUpdated, viewMode = 'grid' }) {
  const { id } = useParams()
  const cat = categories.find(c => String(c.id) === id)
  const filteredGames = games

  const handleDelete = onDelete

  if (!cat) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-brand-muted gap-3">
        <span className="text-5xl">🗂</span>
        <p className="text-lg font-medium">Collection not found</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{cat.icon ?? '🗂'}</span>
        <h2 className="text-xl font-bold text-brand-text">{cat.name}</h2>
        <span className="text-xs text-brand-muted ml-2 uppercase tracking-wider">
          · {filteredGames.length} game{filteredGames.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filteredGames.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-brand-muted gap-3">
          <span className="text-5xl">{cat.icon ?? '🗂'}</span>
          <p className="text-lg font-medium">No games in this collection yet</p>
          <p className="text-sm">Right-click a game card and choose "Manage Collections" to add games here.</p>
        </div>
      ) : (
        viewMode === 'list' ? (
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
              />
            ))}
          </div>
        )
      )}
    </div>
  )
}
