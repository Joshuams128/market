import { nyToUtc } from "./time";
import type { Bar } from "./types";
import type { Instrument } from "./instruments";

// Deterministic PRNG so the demo is stable between reloads.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const BASE: Record<string, number> = { SPY: 560, QQQ: 480, AAPL: 230, NVDA: 140, TSLA: 320, MSFT: 430, AMD: 160, GLD: 245, XAUUSD: 2650 };

/** Synthetic 5-minute bars for `days` weekdays ending today. DEMO DATA ONLY. */
export function mockBars(inst: Instrument, days: number): Bar[] {
  const out: Bar[] = [];
  const rand = rng(hash(inst.symbol));
  let price = BASE[inst.symbol] ?? 100;
  const vol = inst.kind === "gold" ? 0.0007 : 0.0009; // per-bar volatility
  const [startMin, endMin] = inst.kind === "gold" ? [2 * 60, 16 * 60] : [9 * 60 + 30, 16 * 60];
  const now = new Date();
  const list: Date[] = [];
  for (let i = 0; list.length < days; i++) {
    const d = new Date(now.getTime() - i * 86_400_000);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) list.unshift(d);
  }
  for (const d of list) {
    const ny = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d).split("-").map(Number);
    const drift = (rand() - 0.5) * 0.00025; // each day gets a mild trend
    for (let m = startMin; m < endMin; m += 5) {
      const t = nyToUtc(ny[0], ny[1], ny[2], Math.floor(m / 60), m % 60);
      if (t > now.getTime()) break;
      const o = price;
      const shock = (rand() - 0.5) * 2 * vol * o;
      const c = Math.max(1, o + shock + drift * o);
      const wick = rand() * vol * o * 0.8;
      const h = Math.max(o, c) + wick * rand();
      const l = Math.min(o, c) - wick * rand();
      const open = m < startMin + 30 ? 2.2 : m > endMin - 45 ? 1.6 : 1;
      out.push({ t, o, h, l, c, v: Math.round((50_000 + rand() * 80_000) * open) });
      price = c;
    }
    price *= 1 + (rand() - 0.5) * 0.004; // overnight gap
  }
  return out;
}
