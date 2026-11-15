"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Chart from "@/components/Chart";
import type { BacktestStats, Bar, Signal } from "@/lib/types";

type Inst = { symbol: string; name: string; kind: "stock" | "gold"; sessionLabel: string; tradable: string };
type Sig = Signal & {
  sizing: { qty: number; riskAmount: number; notional: number; capped: boolean } | null;
  ticket: { action: string; lots: number; entry: number; stopLoss: number; takeProfit: number; riskAmount: number; stopDistance: number; tooSmall: boolean } | null;
};
type SignalsRes = { source: "alpaca" | "twelvedata" | "mock"; asOf: number | null; bars: Bar[]; signals: Sig[]; kind: string };
type BtRes = { overall: BacktestStats; byStrategy: Record<string, BacktestStats>; note: string; source: string; days: number };
type Meta = { instruments: Inst[]; broker: { configured: boolean; live: boolean }; explainer: boolean };

const STRAT_NAME: Record<string, string> = { orb: "Opening Range Breakout", "vwap-pullback": "VWAP / EMA Pullback" };
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export default function Page() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [symbol, setSymbol] = useState("SPY");
  const [equity, setEquity] = useState(10000);
  const [riskPct, setRiskPct] = useState(0.5);
  const [maxPos, setMaxPos] = useState(25);
  const [data, setData] = useState<SignalsRes | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<number>(0);
  const [bt, setBt] = useState<BtRes | null>(null);
  const [btLoading, setBtLoading] = useState(false);
  const [explain, setExplain] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Sig | null>(null);
  const [orderMsg, setOrderMsg] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time restore from localStorage (must run after hydration) */
    try {
      const s = JSON.parse(localStorage.getItem("dto-settings") || "{}");
      if (s.equity) setEquity(s.equity);
      if (s.riskPct) setRiskPct(s.riskPct);
      if (s.maxPos) setMaxPos(s.maxPos);
    } catch {}
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch("/api/instruments").then((r) => r.json()).then(setMeta);
  }, []);
  useEffect(() => {
    try { localStorage.setItem("dto-settings", JSON.stringify({ equity, riskPct, maxPos })); } catch {}
  }, [equity, riskPct, maxPos]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/signals?symbol=${symbol}&equity=${equity}&riskPct=${riskPct}&maxPos=${maxPos}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j); setErr("");
    } catch (e) { setErr((e as Error).message); }
  }, [symbol, equity, riskPct, maxPos]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 30_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [load]);

  const inst = meta?.instruments.find((i) => i.symbol === symbol);
  const sig = data?.signals[sel] ?? data?.signals[0];
  const lines = useMemo(() => (sig ? { entry: sig.entry, stop: sig.stop, target: sig.target, side: sig.side } : null), [sig]);

  async function runBacktest() {
    setBtLoading(true);
    const r = await fetch(`/api/backtest?symbol=${symbol}&days=30`);
    setBt(await r.json());
    setBtLoading(false);
  }
  async function explainSig(s: Sig) {
    const k = `${s.symbol}-${s.strategy}-${s.time}`;
    setExplain((e) => ({ ...e, [k]: "Thinking…" }));
    const r = await fetch("/api/explain", { method: "POST", body: JSON.stringify({ signal: s }) });
    const j = await r.json();
    setExplain((e) => ({ ...e, [k]: j.text ?? `Error: ${j.error}` }));
  }
  async function placeOrder(s: Sig) {
    if (!s.sizing) return;
    const r = await fetch("/api/order", {
      method: "POST",
      body: JSON.stringify({ symbol: s.symbol, side: s.side, qty: s.sizing.qty, entry: s.entry, stop: s.stop, target: s.target, confirmLive: meta?.broker.live ? true : undefined }),
    });
    const j = await r.json();
    setOrderMsg(r.ok ? `Order accepted (${j.live ? "LIVE" : "PAPER"}) — id ${j.orderId}` : `Rejected: ${j.error}`);
    setConfirm(null);
  }
  function copyTicket(t: NonNullable<Sig["ticket"]>) {
    const text = `${t.action} XAUUSD  Lots: ${t.lots}  Entry: ${t.entry}  SL: ${t.stopLoss}  TP: ${t.takeProfit}`;
    navigator.clipboard?.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  const mock = data?.source === "mock";
  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-xl font-semibold tracking-tight">DayTrade OS</h1>
        {mock && <span className="rounded bg-amber-500/15 text-amber-300 text-xs px-2 py-1">DEMO DATA — synthetic prices</span>}
        {data && !mock && <span className="rounded bg-emerald-500/15 text-emerald-300 text-xs px-2 py-1">Live data: {data.source}</span>}
        {meta && (
          <span className={`rounded text-xs px-2 py-1 ${meta.broker.live ? "bg-red-500/20 text-red-300" : "bg-sky-500/15 text-sky-300"}`}>
            {meta.broker.configured ? (meta.broker.live ? "LIVE TRADING" : "Paper trading") : "Broker not connected"}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-end gap-3 text-xs text-zinc-400">
          <label className="grid gap-1">Balance ($)
            <input type="number" value={equity} min={100} onChange={(e) => setEquity(+e.target.value)} className="w-24 rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-zinc-100" />
          </label>
          <label className="grid gap-1">Risk / trade (%)
            <input type="number" step="0.1" min={0.05} max={2} value={riskPct} onChange={(e) => setRiskPct(+e.target.value)} className="w-20 rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-zinc-100" />
          </label>
          <label className="grid gap-1">Max position (%)
            <input type="number" min={1} max={100} value={maxPos} onChange={(e) => setMaxPos(+e.target.value)} className="w-20 rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-zinc-100" />
          </label>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[180px_1fr_380px]">
        <nav className="flex lg:flex-col gap-1 overflow-x-auto" aria-label="Watchlist">
          {meta?.instruments.map((i) => (
            <button key={i.symbol} onClick={() => { setSymbol(i.symbol); setSel(0); setBt(null); setOrderMsg(""); }}
              className={`text-left rounded px-3 py-2 text-sm whitespace-nowrap border ${symbol === i.symbol ? "bg-zinc-800 border-zinc-700" : "border-transparent hover:bg-zinc-900"}`}>
              <div className="font-medium">{i.symbol}</div>
              <div className="text-xs text-zinc-500">{i.kind === "gold" ? "Gold · London" : i.name === i.symbol ? "US stock" : "Gold ETF"}</div>
            </button>
          ))}
        </nav>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-medium">{inst?.name ?? symbol} · 5-min</h2>
            <span className="text-xs text-zinc-500">{inst?.sessionLabel}{data?.asOf ? ` · last bar ${new Date(data.asOf).toLocaleString()}` : ""}</span>
          </div>
          {err ? <p className="text-red-400 text-sm">{err}</p> : <Chart bars={data?.bars ?? []} lines={lines} />}

          <div className="mt-4 border-t border-zinc-800 pt-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Backtest (last 30 days, 2 bps slippage)</h3>
              <button onClick={runBacktest} disabled={btLoading} className="rounded bg-zinc-800 hover:bg-zinc-700 px-3 py-1 text-sm disabled:opacity-50">{btLoading ? "Running…" : "Run backtest"}</button>
            </div>
            {bt && (
              <div className="mt-3 text-sm">
                <p className="text-xs text-amber-300/90 mb-2">{bt.note}</p>
                <table className="w-full text-left">
                  <thead className="text-xs text-zinc-500"><tr><th className="py-1">Setup</th><th>Trades</th><th>Win rate</th><th>Expectancy</th><th>Profit factor</th><th>Total R</th><th>Max DD</th></tr></thead>
                  <tbody>
                    {[["All setups", bt.overall] as const, ...Object.entries(bt.byStrategy).map(([k, v]) => [STRAT_NAME[k] ?? k, v] as const)].map(([name, s]) => (
                      <tr key={name} className="border-t border-zinc-800">
                        <td className="py-1">{name}</td><td>{s.trades}</td><td>{pct(s.winRate)}</td>
                        <td className={s.expectancyR >= 0 ? "text-emerald-400" : "text-red-400"}>{s.expectancyR.toFixed(2)}R</td>
                        <td>{isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"}</td><td>{s.totalR.toFixed(1)}R</td><td>{s.maxDrawdownR.toFixed(1)}R</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-zinc-500">R = multiples of the amount risked per trade. Fewer than ~100 trades is too small a sample to trust.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="grid gap-3 content-start">
          <h2 className="font-medium">Signals</h2>
          {data && data.signals.length === 0 && (
            <p className="text-sm text-zinc-500 rounded-lg border border-zinc-800 p-4">No active setup right now. Waiting is a valid position — the scanner refreshes every 30 s.</p>
          )}
          {data?.signals.map((s, idx) => {
            const k = `${s.symbol}-${s.strategy}-${s.time}`;
            return (
              <article key={k} onClick={() => setSel(idx)} className={`rounded-lg border p-3 cursor-pointer ${idx === sel ? "border-zinc-600 bg-zinc-900" : "border-zinc-800 bg-zinc-900/40"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${s.side === "long" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>{s.side === "long" ? "BUY" : "SELL"}</span>
                    <span className="text-sm font-medium">{STRAT_NAME[s.strategy] ?? s.strategy}</span>
                  </div>
                  <span className="text-xs text-zinc-400" title="Rule checklist score, not a probability">Setup {s.score}/100</span>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-zinc-500">Entry</dt><dd>{fmt(s.entry)}</dd></div>
                  <div><dt className="text-xs text-zinc-500">Stop</dt><dd className="text-red-300">{fmt(s.stop)}</dd></div>
                  <div><dt className="text-xs text-zinc-500">Target ({s.rr}R)</dt><dd className="text-emerald-300">{fmt(s.target)}</dd></div>
                </dl>
                <ul className="mt-2 list-disc pl-4 text-xs text-zinc-400 space-y-0.5">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>

                {s.sizing && (
                  <p className="mt-2 text-xs text-zinc-300">
                    Size: <b>{s.sizing.qty} sh</b> (${fmt(s.sizing.notional)}) · risking ${fmt(s.sizing.riskAmount)}{s.sizing.capped && " · capped by max position"}
                  </p>
                )}
                {s.ticket && (
                  <p className="mt-2 text-xs text-zinc-300">
                    MT5: <b>{s.ticket.action} {s.ticket.lots} lots</b> · SL ${fmt(s.ticket.stopDistance)} away · risking ${fmt(s.ticket.riskAmount)}
                    {s.ticket.tooSmall && <span className="text-amber-300"> · balance too small for 0.01 lot at this stop</span>}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {s.ticket && !s.ticket.tooSmall && (
                    <button onClick={(e) => { e.stopPropagation(); copyTicket(s.ticket!); }} className="rounded bg-zinc-100 text-zinc-900 px-3 py-1 text-sm font-medium">{copied ? "Copied ✓" : "Copy MT5 ticket"}</button>
                  )}
                  {s.sizing && s.sizing.qty > 0 && meta?.broker.configured && (
                    <button onClick={(e) => { e.stopPropagation(); setConfirm(s); }} className="rounded bg-zinc-100 text-zinc-900 px-3 py-1 text-sm font-medium">Review order…</button>
                  )}
                  {meta?.explainer && (
                    <button onClick={(e) => { e.stopPropagation(); explainSig(s); }} className="rounded bg-zinc-800 hover:bg-zinc-700 px-3 py-1 text-sm">Explain</button>
                  )}
                </div>
                {explain[k] && <p className="mt-2 text-xs text-zinc-300 whitespace-pre-wrap">{explain[k]}</p>}
              </article>
            );
          })}
          {orderMsg && <p className="text-sm rounded border border-zinc-800 p-2">{orderMsg}</p>}
        </aside>
      </div>

      {confirm && confirm.sizing && (
        <div className="fixed inset-0 bg-black/70 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Confirm order">
          <div className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-4">
            <h3 className="font-semibold">{meta?.broker.live ? "⚠ Place LIVE order" : "Place paper order"}</h3>
            <p className="mt-2 text-sm">{confirm.side === "long" ? "Buy" : "Short"} <b>{confirm.sizing.qty} {confirm.symbol}</b> at market with a bracket:</p>
            <ul className="mt-1 text-sm text-zinc-300">
              <li>Stop: {fmt(confirm.stop)} (loss ≈ ${fmt(confirm.sizing.riskAmount)})</li>
              <li>Target: {fmt(confirm.target)}</li>
            </ul>
            <p className="mt-2 text-xs text-zinc-500">Market orders can fill away from the signal price. Day order: unfilled legs cancel at the close.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded bg-zinc-800 px-3 py-1 text-sm">Cancel</button>
              <button onClick={() => placeOrder(confirm)} className={`rounded px-3 py-1 text-sm font-medium ${meta?.broker.live ? "bg-red-500 text-white" : "bg-zinc-100 text-zinc-900"}`}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-8 text-xs text-zinc-500 max-w-3xl">
        Educational software, not financial advice. Signals come from fixed rules and can lose money; the setup score is a checklist, not a probability. Most day traders lose money. Trade on paper first and never risk money you can&apos;t afford to lose.
      </footer>
    </main>
  );
}
