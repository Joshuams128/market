import type { Sized } from "./types";

export type RiskConfig = {
  equity: number;
  riskPct: number; // e.g. 0.5 => risk 0.5% of equity per trade
  maxPositionPct: number; // cap on notional, % of equity (no leverage assumed)
};

export function sizePosition(entry: number, stop: number, cfg: RiskConfig): Sized {
  const perShare = Math.abs(entry - stop);
  const riskAmount = cfg.equity * (cfg.riskPct / 100);
  if (perShare <= 0 || !isFinite(perShare)) return { qty: 0, riskAmount, notional: 0, capped: false };
  let qty = Math.floor(riskAmount / perShare);
  const maxQty = Math.floor((cfg.equity * (cfg.maxPositionPct / 100)) / entry);
  const capped = qty > maxQty;
  if (capped) qty = maxQty;
  return { qty: Math.max(0, qty), riskAmount, notional: Math.max(0, qty) * entry, capped };
}
