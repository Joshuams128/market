export type Bar = {
  t: number; // unix ms (bar open)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type Side = "long" | "short";

export type Signal = {
  symbol: string;
  strategy: string;
  side: Side;
  time: number;
  entry: number;
  stop: number;
  target: number;
  rr: number; // reward:risk
  score: number; // 0-100 rule-based confluence score (NOT a probability)
  reasons: string[];
  atr: number;
};

export type Sized = {
  qty: number;
  riskAmount: number;
  notional: number;
  capped: boolean;
};

export type Trade = {
  strategy: string;
  side: Side;
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  r: number; // result in R multiples
  reason: "target" | "stop" | "eod";
};

export type BacktestStats = {
  trades: number;
  winRate: number;
  avgR: number;
  expectancyR: number;
  profitFactor: number;
  totalR: number;
  maxDrawdownR: number;
};
