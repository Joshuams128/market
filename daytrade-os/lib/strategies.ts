import { atr, ema, groupByDay, nyMinutes, vwap } from "./indicators";
import type { Bar, Signal, Side } from "./types";

/**
 * Rule-based intraday setups on 5-minute bars. Shared by the live scanner and the
 * backtester so what you see in a backtest is what the scanner actually fires.
 *
 * `score` is a confluence checklist (0-100), NOT a win probability.
 */

/** Session windows in minutes since midnight New York time. */
export type SessionCfg = {
  open: number;
  orbCutoff: number;
  pullbackStart: number;
  lastEntry: number;
  eod: number;
  liquid: [number, number][]; // windows that earn a small score bonus
};

export const SESSIONS: Record<"us" | "gold-london", SessionCfg> = {
  us: {
    open: 9 * 60 + 30,
    orbCutoff: 11 * 60 + 30,
    pullbackStart: 9 * 60 + 50,
    lastEntry: 15 * 60 + 30,
    eod: 15 * 60 + 55,
    liquid: [[9 * 60 + 30, 10 * 60 + 30], [14 * 60 + 30, 15 * 60 + 55]],
  },
  // London open 08:00 UK = 03:00 New York; flat by noon NY (~17:00 UK)
  "gold-london": {
    open: 3 * 60,
    orbCutoff: 6 * 60,
    pullbackStart: 3 * 60 + 20,
    lastEntry: 11 * 60,
    eod: 12 * 60,
    liquid: [[3 * 60, 5 * 60], [8 * 60, 11 * 60]],
  },
};

const RR_TARGET = 2;

export type StrategyId = "orb" | "vwap-pullback";
export const STRATEGIES: { id: StrategyId; name: string }[] = [
  { id: "orb", name: "Opening Range Breakout" },
  { id: "vwap-pullback", name: "VWAP / EMA Pullback" },
];

function clampStop(side: Side, entry: number, rawStop: number, a: number): number {
  const minD = 0.5 * a;
  const maxD = 2 * a;
  const d = Math.min(maxD, Math.max(minD, Math.abs(entry - rawStop)));
  return side === "long" ? entry - d : entry + d;
}

function build(
  symbol: string,
  strategy: string,
  side: Side,
  bar: Bar,
  rawStop: number,
  a: number,
  score: number,
  reasons: string[],
): Signal {
  const entry = bar.c;
  const stop = clampStop(side, entry, rawStop, a);
  const risk = Math.abs(entry - stop);
  const target = side === "long" ? entry + RR_TARGET * risk : entry - RR_TARGET * risk;
  return {
    symbol,
    strategy,
    side,
    time: bar.t,
    entry,
    stop,
    target,
    rr: RR_TARGET,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    atr: a,
  };
}

function avgVol(bars: Bar[], i: number, n = 20): number {
  const from = Math.max(0, i - n);
  let s = 0;
  for (let j = from; j < i; j++) s += bars[j].v;
  return i > from ? s / (i - from) : 0;
}

/** Scan one trading day. Returns at most one signal per strategy. */
export function scanDay(
  symbol: string,
  day: Bar[],
  history: Bar[] = day,
  cfg: SessionCfg = SESSIONS.us,
): Signal[] {
  const OPEN = cfg.open;
  const OR_END = OPEN + 15; // opening range = first 15 minutes
  const ORB_CUTOFF = cfg.orbCutoff;
  const PULLBACK_START = cfg.pullbackStart;
  const LAST_ENTRY = cfg.lastEntry;
  if (day.length < 8) return [];
  const out: Signal[] = [];
  const closes = day.map((b) => b.c);
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const vw = vwap(day);
  // ATR from the full history (so early-session values are not noisy)
  const atrAll = atr(history, 14);
  const atrByT = new Map<number, number>();
  history.forEach((b, i) => atrByT.set(b.t, atrAll[i]));

  // --- Opening Range Breakout ---
  const orBars = day.filter((b) => nyMinutes(b.t) >= OPEN && nyMinutes(b.t) < OR_END);
  if (orBars.length >= 3) {
    const orHigh = Math.max(...orBars.map((b) => b.h));
    const orLow = Math.min(...orBars.map((b) => b.l));
    const orMid = (orHigh + orLow) / 2;
    for (let i = 0; i < day.length; i++) {
      const b = day[i];
      const m = nyMinutes(b.t);
      if (m < OR_END || m > ORB_CUTOFF) continue;
      const a = atrByT.get(b.t) ?? 0;
      if (!a) continue;
      const vr = avgVol(day, i) > 0 ? b.v / avgVol(day, i) : 1;
      let side: Side | null = null;
      if (b.c > orHigh) side = "long";
      else if (b.c < orLow) side = "short";
      if (!side) continue;
      const reasons = [
        `Closed ${side === "long" ? "above" : "below"} the 15-min opening range (${orLow.toFixed(2)}–${orHigh.toFixed(2)})`,
      ];
      let score = 45;
      if (vr >= 1.2) {
        score += Math.min(20, (vr - 1) * 20);
        reasons.push(`Breakout volume ${vr.toFixed(1)}× recent average`);
      }
      if ((side === "long" && b.c > vw[i]) || (side === "short" && b.c < vw[i])) {
        score += 15;
        reasons.push(`Price on the ${side === "long" ? "upper" : "lower"} side of VWAP`);
      }
      if ((side === "long" && e9[i] > e21[i]) || (side === "short" && e9[i] < e21[i])) {
        score += 15;
        reasons.push("9/21 EMA aligned with direction");
      }
      if (vr < 1) score -= 10;
      out.push(build(symbol, "orb", side, b, orMid, a, score, reasons));
      break;
    }
  }

  // --- VWAP / EMA trend pullback ---
  for (let i = 5; i < day.length; i++) {
    const b = day[i];
    const m = nyMinutes(b.t);
    if (m < PULLBACK_START || m > LAST_ENTRY) continue;
    const a = atrByT.get(b.t) ?? 0;
    if (!a) continue;
    const prev = day[i - 1];
    const up = e9[i] > e21[i] && b.c > vw[i] && e21[i] > e21[i - 3];
    const down = e9[i] < e21[i] && b.c < vw[i] && e21[i] < e21[i - 3];
    let side: Side | null = null;
    let swing = 0;
    const recent = day.slice(i - 5, i + 1);
    if (up && prev.l <= e21[i - 1] * 1.0005 && b.c > e9[i] && b.c > b.o) {
      side = "long";
      swing = Math.min(...recent.map((x) => x.l)) - 0.1 * a;
    } else if (down && prev.h >= e21[i - 1] * 0.9995 && b.c < e9[i] && b.c < b.o) {
      side = "short";
      swing = Math.max(...recent.map((x) => x.h)) + 0.1 * a;
    }
    if (!side) continue;
    const vr = avgVol(day, i) > 0 ? b.v / avgVol(day, i) : 1;
    const reasons = [
      `${side === "long" ? "Uptrend" : "Downtrend"}: 9/21 EMA stacked and price ${side === "long" ? "above" : "below"} VWAP`,
      `Pulled back to the 21 EMA and closed back through the 9 EMA`,
    ];
    let score = 50;
    if (vr >= 1) {
      score += Math.min(15, (vr - 1) * 15 + 5);
      reasons.push(`Confirmation bar volume ${vr.toFixed(1)}× average`);
    }
    const slope = Math.abs(e21[i] - e21[i - 3]) / a;
    if (slope > 0.3) {
      score += 15;
      reasons.push("Trend slope is strong relative to ATR");
    }
    if (cfg.liquid.some(([a, z]) => m >= a && m <= z)) score += 5; // liquid windows
    out.push(build(symbol, "vwap-pullback", side, b, swing, a, score, reasons));
    break;
  }

  return out;
}

/** Is a signal still actionable given the bars after it fired? */
export function stillValid(sig: Signal, laterBars: Bar[]): boolean {
  for (const b of laterBars) {
    if (sig.side === "long" ? b.l <= sig.stop || b.h >= sig.target : b.h >= sig.stop || b.l <= sig.target)
      return false;
  }
  return true;
}

export function scanLatest(
  symbol: string,
  bars: Bar[],
  maxAgeBars = 6,
  cfg: SessionCfg = SESSIONS.us,
): Signal[] {
  const days = groupByDay(bars);
  const today = days[days.length - 1];
  if (!today) return [];
  const sigs = scanDay(symbol, today, bars, cfg);
  const lastT = today[today.length - 1].t;
  return sigs
    .filter((s) => {
      const idx = today.findIndex((b) => b.t === s.time);
      const age = today.length - 1 - idx;
      return age <= maxAgeBars && stillValid(s, today.slice(idx + 1)) && s.time <= lastT;
    })
    .sort((a, b) => b.score - a.score);
}
