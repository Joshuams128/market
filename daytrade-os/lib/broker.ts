const LIVE = process.env.ALPACA_LIVE === "true";
const BASE = LIVE ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
export const isLive = () => LIVE;

const headers = () => ({
  "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID ?? "",
  "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET ?? "",
  "Content-Type": "application/json",
});

export const brokerConfigured = () => !!(process.env.ALPACA_KEY_ID && process.env.ALPACA_SECRET);

export async function getAccount() {
  const r = await fetch(`${BASE}/v2/account`, { headers: headers(), cache: "no-store" });
  if (!r.ok) throw new Error(`Alpaca account ${r.status}: ${await r.text()}`);
  return r.json() as Promise<{ equity: string; buying_power: string; status: string }>;
}

export type OrderInput = { symbol: string; side: "long" | "short"; qty: number; stop: number; target: number };

/** Market entry with attached stop-loss and take-profit (bracket), day order. */
export async function placeBracket(o: OrderInput) {
  const body = {
    symbol: o.symbol,
    qty: String(o.qty),
    side: o.side === "long" ? "buy" : "sell",
    type: "market",
    time_in_force: "day",
    order_class: "bracket",
    take_profit: { limit_price: o.target.toFixed(2) },
    stop_loss: { stop_price: o.stop.toFixed(2) },
  };
  const r = await fetch(`${BASE}/v2/orders`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || `Alpaca order ${r.status}`);
  return j;
}

export async function getClock() {
  const r = await fetch(`${BASE}/v2/clock`, { headers: headers(), cache: "no-store" });
  if (!r.ok) throw new Error(`Alpaca clock ${r.status}: ${await r.text()}`);
  return r.json() as Promise<{ is_open: boolean; next_open: string }>;
}

/** Latest traded price from Alpaca market data (same feed as the signals). */
export async function getLastPrice(symbol: string): Promise<number> {
  const u = new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/trades/latest`);
  u.searchParams.set("feed", process.env.ALPACA_FEED || "iex");
  const r = await fetch(u, { headers: headers(), cache: "no-store" });
  if (!r.ok) throw new Error(`Alpaca last trade ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { trade?: { p?: number } };
  const p = Number(j.trade?.p);
  if (!(p > 0)) throw new Error("No last-trade price available.");
  return p;
}
