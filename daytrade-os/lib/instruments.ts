import type { SessionCfg } from "./strategies";
import { SESSIONS } from "./strategies";

export type Instrument = {
  symbol: string;
  name: string;
  kind: "stock" | "gold";
  session: SessionCfg;
  sessionLabel: string;
  tradable: "alpaca" | "mt5-manual";
};

export const INSTRUMENTS: Instrument[] = [
  ...["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "MSFT", "AMD"].map(
    (s): Instrument => ({
      symbol: s,
      name: s,
      kind: "stock",
      session: SESSIONS.us,
      sessionLabel: "US open (09:30 ET)",
      tradable: "alpaca",
    }),
  ),
  { symbol: "GLD", name: "Gold ETF (GLD)", kind: "stock", session: SESSIONS.us, sessionLabel: "US open (09:30 ET)", tradable: "alpaca" },
  { symbol: "XAUUSD", name: "Gold spot (XAU/USD)", kind: "gold", session: SESSIONS["gold-london"], sessionLabel: "London open (08:00 UK)", tradable: "mt5-manual" },
];

export const bySymbol = (s: string) => INSTRUMENTS.find((i) => i.symbol === s);
