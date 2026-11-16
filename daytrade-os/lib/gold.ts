import type { Signal } from "./types";

/** XAUUSD on MT5: 1 lot = 100 oz, so a $1 move per lot = $100. Verify contract size with your broker. */
export function goldTicket(sig: Signal, balance: number, riskPct: number, contractOz = 100) {
  const riskAmount = balance * (riskPct / 100);
  const stopDist = Math.abs(sig.entry - sig.stop);
  const raw = riskAmount / (stopDist * contractOz);
  const lots = Math.floor(raw * 100) / 100; // 0.01 lot step, round DOWN
  return {
    action: sig.side === "long" ? "BUY" : "SELL",
    lots,
    entry: +sig.entry.toFixed(2),
    stopLoss: +sig.stop.toFixed(2),
    takeProfit: +sig.target.toFixed(2),
    riskAmount: +riskAmount.toFixed(2),
    stopDistance: +stopDist.toFixed(2),
    tooSmall: lots < 0.01,
  };
}
