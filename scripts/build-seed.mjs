import fs from 'node:fs';
const games=JSON.parse(fs.readFileSync(new URL('../data/games.json',import.meta.url),'utf8'));
const esc=v=>String(v??'').replaceAll("'","''");
const rows=games.map(g=>`INSERT OR REPLACE INTO games(id,title,red,black,event,year,result,termination,source_name,source_url,source_game_id,moves_json,featured,published,cache_status) VALUES('${esc(g.id)}','${esc(g.title)}','${esc(g.red)}','${esc(g.black)}','${esc(g.event)}','${esc(g.year)}','${esc(g.result||'*')}','${esc(g.termination||'unknown')}','${esc(g.source?.name||'Bundled seed')}','${esc(g.source?.url||'')}','${esc(g.id)}','${esc(JSON.stringify(g.moves||[]))}',${g.featured?1:0},1,'pending');`).join('\n');
fs.writeFileSync(new URL('../worker/seed.sql',import.meta.url),`BEGIN;\n${rows}\nCOMMIT;\n`);
console.log(`Generated ${games.length} games`);
