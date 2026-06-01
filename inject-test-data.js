#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const dbPath = path.join(process.env.APPDATA || process.env.HOME, 'GameLibraryManager', 'library.json');

try {
  const content = fs.readFileSync(dbPath, 'utf-8');
  const db = JSON.parse(content);
  
  if (!db.games) {
    console.error('❌ No games array in database');
    process.exit(1);
  }
  
  console.log(`Loaded ${db.games.length} games\n`);
  
  // Inject test sizes (100, 75, 60, 50, 25 GB)
  const testSizes = [100, 75, 60, 50, 25];
  for (let i = 0; i < Math.min(5, db.games.length); i++) {
    db.games[i].size = testSizes[i];
    console.log(`✅ Game ${i + 1}: "${db.games[i].title.substring(0, 40)}" → Size: ${testSizes[i]} GB`);
  }
  
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
  console.log('\n✅ Test data injected successfully');
  process.exit(0);
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
