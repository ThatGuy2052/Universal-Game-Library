const testData = [
  { id: 8, title: 'Subnautica Below Zero', size: 50 },
  { id: 9, title: 'Creo God Simulator', size: 100 },
  { id: 10, title: 'Deep Space Battle Simulator', size: 25 },
  { id: 11, title: 'Tilesetter Lite', size: 75 },
  { id: 12, title: 'OMORI', size: 60 },
];

console.log('INPUT DATA:');
testData.forEach(g => console.log('  ' + g.size + ' GB - ' + g.title));

console.log('\n✅ CORRECT: Size-Desc (Largest First):');
const sizeDesc = [...testData].sort((a, b) => b.size - a.size);
sizeDesc.forEach(g => console.log('  ' + g.size + ' GB - ' + g.title));

console.log('\n✅ CORRECT: Size-Asc (Smallest First):');
const sizeAsc = [...testData].sort((a, b) => a.size - b.size);
sizeAsc.forEach(g => console.log('  ' + g.size + ' GB - ' + g.title));

console.log('\n❌ WRONG (if sort falls back to alphabetical):');
const alpha = [...testData].sort((a, b) => a.title.localeCompare(b.title));
alpha.forEach(g => console.log('  ' + g.title));
