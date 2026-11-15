import { nyMinutes } from "./indicators";
import type { Instrument } from "./instruments";
import { mockBars } from "./mock";
import type { Bar } from "./types";

export type DataSource = "alpaca" | "twelvedata" | "mock";

// Short server-side cache so polling tabs don't burn provider quotas (Twelve Data free tier is ~800 calls/day).
const cache = new Map<string, { at: number; value: { bars: Bar[]; source: DataSource } }>();

export async function getBars(inst: Instrument, days = 10): Promise<{ bars: Bar[]; source: DataSource }> {
  const key = `${inst.symbol}:${days}`;
  const ttl = inst.kind === "gold" ? 180_000 : 20_000;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await fetchBars(inst, days);
  if (value.source !== "mock") cache.set(key, { at: Date.now(), value });
  return value;
}

async function fetchBars(inst: Instrument, days: number): Promise<{ bars: Bar[]; source: DataSource }> {
  try {
    if (inst.kind === "stock" && process.env.ALPACA_KEY_ID && process.env.ALPACA_SECRET) {
      const bars = await alpacaBars(inst.symbol, days);
      if (bars.length) return { bars, source: "alpaca" };
    }
    if (inst.kind === "gold" && process.env.TWELVEDATA_API_KEY) {
      const bars = await twelveBars(days);
      if (bars.length) return { bars, source: "twelvedata" };
    }
  } catch (e) {
    console.error("data provider failed, falling back to mock:", e);
  }
  return { bars: mockBars(inst, days), source: "mock" };
}

async function alpacaBars(symbol: string, days: number): Promise<Bar[]> {
  const start = new Date(Date.now() - (days * 1.6 + 3) * 86_400_000).toISOString();
  const out: Bar[] = [];
  let token = "";
  for (let page = 0; page < 10; page++) {
    const u = new URL(`https://data.alpaca.markets/v2/stocks/${symbol}/bars`);
    u.searchParams.set("timeframe", "5Min");
    u.searchParams.set("start", start);
    u.searchParams.set("limit", "10000");
    u.searchParams.set("feed", process.env.ALPACA_FEED || "iex");
    u.searchParams.set("adjustment", "raw");
    if (token) u.searchParams.set("page_token", token);
    const r = await fetch(u, {
      headers: { "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID!, "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET! },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`Alpaca bars ${r.status}: ${await r.text()}`);
    const j = await r.json();
    for (const b of j.bars ?? []) out.push({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
    token = j.next_page_token;
    if (!token) break;
  }
  // regular session only
  return out.filter((b) => {
    const m = nyMinutes(b.t);
    return m >= 9 * 60 + 30 && m < 16 * 60;
  });
}

async function twelveBars(days: number): Promise<Bar[]> {
  const u = new URL("https://api.twelvedata.com/time_series");
  u.searchParams.set("symbol", "XAU/USD");
  u.searchParams.set("interval", "5min");
  u.searchParams.set("outputsize", String(Math.min(5000, days * 288)));
  u.searchParams.set("timezone", "UTC");
  u.searchParams.set("apikey", process.env.TWELVEDATA_API_KEY!);
  const r = await fetch(u, { cache: "no-store" });
  if (!r.ok) throw new Error(`TwelveData ${r.status}`);
  const j = await r.json();
  if (j.status === "error") throw new Error(j.message);
  // Spot gold has no real volume: v=1 makes VWAP an equal-weighted session average.
  return (j.values as Record<string, string>[])
    .map((x) => ({ t: Date.parse(x.datetime.replace(" ", "T") + "Z"), o: +x.open, h: +x.high, l: +x.low, c: +x.close, v: +x.volume || 1 }))
    .sort((a, b) => a.t - b.t);
}
