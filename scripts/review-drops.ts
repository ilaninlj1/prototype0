// Writes drops/review.html: upcoming drops with players and swap commands.
import fs from 'node:fs';
import path from 'node:path';

import type { DropSong } from '../lib/daily-drop.ts';
import { todayKey } from '../lib/daily-drop.ts';

const DIR = path.resolve(import.meta.dirname, '../drops');
const file = JSON.parse(fs.readFileSync(path.join(DIR, 'drops.json'), 'utf8')) as {
  days: Record<string, { number: number; songs: DropSong[]; candidates?: Record<string, DropSong[]> }>;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const row = (s: DropSong, cmd: string) =>
  `<tr><td>${s.slot}</td><td>${esc(s.artist)} — ${esc(s.title)}<br><small>${s.listeners.toLocaleString()} listeners · ${esc(s.genre)}</small></td>` +
  `<td><audio controls preload="none" src="${s.previewUrl}"></audio></td><td><code>${cmd}</code></td></tr>`;

const today = todayKey(new Date());
const sections = Object.entries(file.days)
  .filter(([day]) => day >= today)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([day, d]) => {
    const songs = d.songs.map((s) => row(s, `npm run make-drops -- --redo ${day} --slot ${s.slot}`)).join('');
    const cands = Object.entries(d.candidates ?? {})
      .flatMap(([slot, list]) => list.map((s, i) => row(s, `${slot}=${i + 1}`)))
      .join('');
    return `<h2>#${d.number} · ${day}</h2><table>${songs}${cands ? `<tr><th colspan=4>Candidates — npm run make-drops -- --choose ${day} slot=n …</th></tr>${cands}` : ''}</table>`;
  })
  .join('');

fs.writeFileSync(
  path.join(DIR, 'review.html'),
  `<!doctype html><meta charset=utf-8><title>Drop review</title><style>body{font:14px system-ui;background:#111;color:#eee;padding:16px}td{padding:6px;border-bottom:1px solid #333}code{color:#b9a2ff}</style>${sections}`
);
console.log('Wrote drops/review.html');
