#!/usr/bin/env node
// Rebuilds docs/fixtures/*.csv from Yahoo Finance daily bars.
// Run: node scripts/build-fixtures.mjs
// See docs/decisions.md, "Fixture data source and repair", for why each step exists.

import { writeFileSync, mkdirSync } from 'node:fs';

const TARGETS = [
  { symbol: 'BA', out: 'ba-weekly.csv' },
  { symbol: 'RMS.PA', out: 'rms-weekly.csv' },
];
const FROM = 915148800; // 1999-01-01
const TO = 1788134400;
const DIR = new URL('../docs/fixtures/', import.meta.url);

const mondayOf = (d) => {
  const m = new Date(d);
  m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
  return m.toISOString().slice(0, 10);
};

async function build({ symbol, out }) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${FROM}&period2=${TO}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const r = (await res.json()).chart.result[0];
  const { gmtoffset } = r.meta;
  const q = r.indicators.quote[0];

  const weeks = new Map();
  let placeholders = 0;
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some((v) => v == null)) continue;
    const v = q.volume[i] ?? 0;
    // Yahoo emits placeholder rows on exchange holidays: zero volume, o=h=l set
    // to a junk value, close carried over. They inject false weekly lows.
    if (v === 0 && o === h && h === l) { placeholders++; continue; }

    const key = mondayOf(new Date((r.timestamp[i] + gmtoffset) * 1000));
    const w = weeks.get(key);
    if (!w) weeks.set(key, { o, h, l, c, v });
    else { w.h = Math.max(w.h, h); w.l = Math.min(w.l, l); w.c = c; w.v += v; }
  }

  const round = (n) => Math.round(n * 1e4) / 1e4;
  const rows = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));
  const csv = ['date,open,high,low,close,volume']
    .concat(rows.map(([d, w]) =>
      [d, round(w.o), round(w.h), round(w.l), round(w.c), Math.trunc(w.v)].join(',')))
    .join('\n') + '\n';

  mkdirSync(DIR, { recursive: true });
  writeFileSync(new URL(out, DIR), csv);
  console.log(`${out}: ${rows.length} weekly bars, ${placeholders} placeholder rows dropped, ${rows[0][0]} -> ${rows.at(-1)[0]}`);
}

for (const t of TARGETS) await build(t);
