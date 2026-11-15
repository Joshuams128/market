import { getBars } from "@/lib/data";
import { goldTicket } from "@/lib/gold";
import { bySymbol } from "@/lib/instruments";
import { sizePosition } from "@/lib/risk";
import { scanLatest } from "@/lib/strategies";


export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const inst = bySymbol(q.get("symbol") ?? "");
  if (!inst) return Response.json({ error: "Unknown symbol" }, { status: 400 });
  const equity = Math.max(100, Number(q.get("equity") ?? 10000));
  const riskPct = Math.min(2, Math.max(0.05, Number(q.get("riskPct") ?? 0.5)));
  const maxPos = Math.min(100, Math.max(1, Number(q.get("maxPos") ?? 25)));

  const { bars, source } = await getBars(inst, 10);
  const signals = scanLatest(inst.symbol, bars, 6, inst.session).map((s) => ({
    ...s,
    sizing: inst.kind === "gold" ? null : sizePosition(s.entry, s.stop, { equity, riskPct, maxPositionPct: maxPos }),
    ticket: inst.kind === "gold" ? goldTicket(s, equity, riskPct) : null,
  }));
  return Response.json({
    instrument: inst.symbol,
    kind: inst.kind,
    source,
    asOf: bars.at(-1)?.t ?? null,
    bars: bars.slice(-160),
    signals,
  });
}
