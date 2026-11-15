import { groupByDay, nyMinutes } from "./indicators";
import { SESSIONS, scanDay, type SessionCfg } from "./strategies";
import type { Bar, BacktestStats, Signal, Trade } from "./types";

export type BacktestOptions = {
  slippageBps?: number; // each side
  strategy?: string; // filter to one strategy id
  minScore?: number;
  session?: SessionCfg;
};

function simulate(sig: Signal, day: Bar[], slipBps: number, eod: number): Trade | null {
  const idx = day.findIndex((b) => b.t === sig.time);
  if (idx < 0) return null;
  const slip = (slipBps / 10_000) * sig.entry;
  const dir = sig.side === "long" ? 1 : -1;
  const entry = sig.entry + dir * slip; // worse fill
  const risk = Math.abs(sig.entry - sig.stop);
  if (risk <= 0) return null;

  for (let i = idx + 1; i < day.length; i++) {
    const b = day[i];
    const hitStop = sig.side === "long" ? b.l <= sig.stop : b.h >= sig.stop;
    const hitTarget = sig.side === "long" ? b.h >= sig.target : b.l <= sig.target;
    // If both are touched inside one bar we can't know the order: assume the stop (conservative).
    if (hitStop || hitTarget || nyMinutes(b.t) >= eod || i === day.length - 1) {
      let exit: number;
      let reason: Trade["reason"];
      if (hitStop) {
        exit = sig.stop - dir * slip;
        reason = "stop";
      } else if (hitTarget) {
        exit = sig.target - dir * slip;
        reason = "target";
      } else {
        exit = b.c - dir * slip;
        reason = "eod";
      }
      return {
        strategy: sig.strategy,
        side: sig.side,
        entryTime: sig.time,
        exitTime: b.t,
        entry,
        exit,
        r: (dir * (exit - entry)) / risk,
        reason,
      };
    }
  }
  return null;
}

export function statsOf(trades: Trade[]): BacktestStats {
  const n = trades.length;
  if (!n)
    return { trades: 0, winRate: 0, avgR: 0, expectancyR: 0, profitFactor: 0, totalR: 0, maxDrawdownR: 0 };
  const wins = trades.filter((t) => t.r > 0);
  const grossWin = wins.reduce((s, t) => s + t.r, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.r <= 0).reduce((s, t) => s + t.r, 0));
  let eq = 0;
  let peak = 0;
  let dd = 0;
  for (const t of trades) {
    eq += t.r;
    peak = Math.max(peak, eq);
    dd = Math.max(dd, peak - eq);
  }
  const total = trades.reduce((s, t) => s + t.r, 0);
  return {
    trades: n,
    winRate: wins.length / n,
    avgR: total / n,
    expectancyR: total / n,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    totalR: total,
    maxDrawdownR: dd,
  };
}

export function backtest(symbol: string, bars: Bar[], opts: BacktestOptions = {}) {
  const slip = opts.slippageBps ?? 2;
  const cfg = opts.session ?? SESSIONS.us;
  const trades: Trade[] = [];
  for (const day of groupByDay(bars)) {
    // history up to and including this day, so ATR has warm-up without look-ahead
    const hist = bars.filter((b) => b.t <= day[day.length - 1].t);
    for (const sig of scanDay(symbol, day, hist, cfg)) {
      if (opts.strategy && sig.strategy !== opts.strategy) continue;
      if (opts.minScore && sig.score < opts.minScore) continue;
      const t = simulate(sig, day, slip, cfg.eod);
      if (t) trades.push(t);
    }
  }
  const byStrategy: Record<string, BacktestStats> = {};
  for (const id of new Set(trades.map((t) => t.strategy)))
    byStrategy[id] = statsOf(trades.filter((t) => t.strategy === id));
  return { overall: statsOf(trades), byStrategy, trades };
}
