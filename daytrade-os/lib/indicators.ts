import type { Bar } from "./types";

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** Wilder ATR. Returns an array aligned with bars (first values are warm-up estimates). */
export function atr(bars: Bar[], period = 14): number[] {
  const out: number[] = [];
  let prevAtr = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const pc = i > 0 ? bars[i - 1].c : b.o;
    const tr = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
    prevAtr = i === 0 ? tr : (prevAtr * (period - 1) + tr) / period;
    out.push(prevAtr);
  }
  return out;
}

/** Session-anchored VWAP: resets each calendar day (America/New_York). */
export function vwap(bars: Bar[]): number[] {
  const out: number[] = [];
  let day = "";
  let pv = 0;
  let vol = 0;
  for (const b of bars) {
    const d = nyDay(b.t);
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const tp = (b.h + b.l + b.c) / 3;
    pv += tp * b.v;
    vol += b.v;
    out.push(vol > 0 ? pv / vol : b.c);
  }
  return out;
}

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function nyDay(t: number): string {
  return dayFmt.format(new Date(t));
}

/** Minutes since midnight, New York time. */
export function nyMinutes(t: number): number {
  const [h, m] = timeFmt.format(new Date(t)).split(":").map(Number);
  return (h % 24) * 60 + m;
}

export function groupByDay(bars: Bar[]): Bar[][] {
  const days: Bar[][] = [];
  let cur: Bar[] = [];
  let curDay = "";
  for (const b of bars) {
    const d = nyDay(b.t);
    if (d !== curDay) {
      if (cur.length) days.push(cur);
      cur = [];
      curDay = d;
    }
    cur.push(b);
  }
  if (cur.length) days.push(cur);
  return days;
}
