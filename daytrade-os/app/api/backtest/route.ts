import { backtest } from "@/lib/backtest";
import { getBars } from "@/lib/data";
import { bySymbol } from "@/lib/instruments";


export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const inst = bySymbol(q.get("symbol") ?? "");
  if (!inst) return Response.json({ error: "Unknown symbol" }, { status: 400 });
  const days = Math.min(60, Math.max(5, Number(q.get("days") ?? 30)));
  const { bars, source } = await getBars(inst, days);
  const res = backtest(inst.symbol, bars, {
    session: inst.session,
    strategy: q.get("strategy") || undefined,
    minScore: Number(q.get("minScore") ?? 0) || undefined,
    slippageBps: Number(q.get("slip") ?? 2),
  });
  return Response.json({
    instrument: inst.symbol,
    source,
    days,
    overall: res.overall,
    byStrategy: res.byStrategy,
    recent: res.trades.slice(-15).reverse(),
    note:
      source === "mock"
        ? "Synthetic demo data: results mean nothing. Add data keys to backtest real prices."
        : "Past performance does not predict future results. Small samples are unreliable.",
  });
}
