import { brokerConfigured, getAccount, getClock, getLastPrice, isLive, placeBracket } from "@/lib/broker";
import { bySymbol } from "@/lib/instruments";

const MAX_RISK_PCT = 2; // hard server-side ceiling per trade, regardless of what the client sends

const MAX_DRIFT_R = 0.5; // reject if the live price is already > 0.5R away from the signal entry

/** This app has no login, so by default orders are only accepted from the machine running it. */
function isLocal(req: Request) {
  const host = (req.headers.get("host") ?? "").split(":")[0];
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

export async function POST(req: Request) {
  if (!isLocal(req) && process.env.ALLOW_REMOTE_ORDERS !== "true")
    return Response.json({ error: "Orders are only accepted from localhost (the app has no login). Set ALLOW_REMOTE_ORDERS=true only behind your own access control." }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: "Bad JSON" }, { status: 400 });
  const inst = bySymbol(b.symbol);
  if (!inst || inst.tradable !== "alpaca")
    return Response.json({ error: "This instrument can't be traded through the app (gold spot is copy-to-MT5)." }, { status: 400 });
  if (!brokerConfigured()) return Response.json({ error: "Alpaca keys not configured." }, { status: 400 });

  const qty = Math.floor(Number(b.qty));
  const entry = Number(b.entry), stop = Number(b.stop), target = Number(b.target);
  if (![entry, stop, target].every((n) => Number.isFinite(n) && n > 0))
    return Response.json({ error: "Invalid entry/stop/target." }, { status: 400 });
  const side = b.side === "short" ? "short" : "long";
  const sane = side === "long" ? stop < entry && entry < target : target < entry && entry < stop;
  if (!(qty >= 1) || !sane) return Response.json({ error: "Invalid quantity or stop/target levels." }, { status: 400 });

  if (isLive() && b.confirmLive !== true)
    return Response.json({ error: "LIVE account: explicit confirmation required." }, { status: 400 });

  try {
    const acct = await getAccount();
    const equity = Number(acct.equity);
    if (acct.status !== "ACTIVE") return Response.json({ error: `Alpaca account status is ${acct.status}.` }, { status: 400 });
    const clock = await getClock();
    if (!clock.is_open)
      return Response.json({ error: `Market is closed (next open ${clock.next_open}). Signals from the last session are stale.` }, { status: 400 });
    // Market order fills at the live price, not the signal price: check it hasn't run away.
    const last = await getLastPrice(inst.symbol);
    const unit = Math.abs(entry - stop);
    const crossed = side === "long" ? last <= stop || last >= target : last >= stop || last <= target;
    if (crossed || Math.abs(last - entry) > MAX_DRIFT_R * unit)
      return Response.json({ error: `Price has moved: last ${last.toFixed(2)} vs signal entry ${entry.toFixed(2)}. Wait for a fresh signal.` }, { status: 400 });
    const risk = qty * Math.max(unit, Math.abs(last - stop));
    if (risk > equity * (MAX_RISK_PCT / 100))
      return Response.json({ error: `Risk $${risk.toFixed(2)} exceeds the ${MAX_RISK_PCT}% per-trade ceiling.` }, { status: 400 });
    if (qty * entry > Number(acct.buying_power))
      return Response.json({ error: "Not enough buying power." }, { status: 400 });
    const order = await placeBracket({ symbol: inst.symbol, side, qty, stop, target });
    return Response.json({ ok: true, live: isLive(), orderId: order.id, status: order.status });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
