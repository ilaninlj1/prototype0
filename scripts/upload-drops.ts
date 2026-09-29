// Upserts every complete day in drops/drops.json to Supabase's drops table.
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local');

const file = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../drops/drops.json'), 'utf8')) as {
  days: Record<string, { number: number; songs: unknown[] }>;
};
const rows = Object.entries(file.days)
  .filter(([, d]) => d.songs.length === 5)
  .map(([day, d]) => ({ day, number: d.number, songs: d.songs }));

const res = await fetch(`${url}/rest/v1/drops`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify(rows),
});
if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
console.log(`Uploaded ${rows.length} drops.`);
