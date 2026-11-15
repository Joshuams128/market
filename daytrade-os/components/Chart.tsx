"use client";
import type { Bar } from "@/lib/types";

type Lines = { entry: number; stop: number; target: number; side: "long" | "short" } | null;

export default function Chart({ bars, lines }: { bars: Bar[]; lines: Lines }) {
  const data = bars.slice(-110);
  if (!data.length) return <div className="h-72 grid place-items-center text-zinc-500">No data</div>;
  const W = 900, H = 320, padR = 64, padT = 10, padB = 20;
  let lo = Math.min(...data.map((b) => b.l));
  let hi = Math.max(...data.map((b) => b.h));
  if (lines) {
    lo = Math.min(lo, lines.stop, lines.target, lines.entry);
    hi = Math.max(hi, lines.stop, lines.target, lines.entry);
  }
  const pad = (hi - lo) * 0.05 || 1;
  lo -= pad; hi += pad;
  const y = (p: number) => padT + ((hi - p) / (hi - lo)) * (H - padT - padB);
  const step = (W - padR) / data.length;
  const cw = Math.max(1.5, step * 0.62);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const line = (p: number, color: string, label: string) => (
    <g key={label}>
      <line x1={0} x2={W - padR} y1={y(p)} y2={y(p)} stroke={color} strokeDasharray="5 4" strokeWidth={1} />
      <text x={W - padR + 4} y={y(p) + 4} fontSize={11} fill={color}>{label} {p.toFixed(2)}</text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Price chart">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={0} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#27272a" />
          <text x={W - padR + 4} y={y(t) + 4} fontSize={10} fill="#71717a">{t.toFixed(2)}</text>
        </g>
      ))}
      {data.map((b, i) => {
        const x = i * step + step / 2;
        const up = b.c >= b.o;
        const col = up ? "#22c55e" : "#ef4444";
        return (
          <g key={b.t}>
            <line x1={x} x2={x} y1={y(b.h)} y2={y(b.l)} stroke={col} />
            <rect x={x - cw / 2} y={y(Math.max(b.o, b.c))} width={cw} height={Math.max(1, Math.abs(y(b.o) - y(b.c)))} fill={col} />
          </g>
        );
      })}
      {lines && (
        <>
          {line(lines.entry, "#a1a1aa", "Entry")}
          {line(lines.stop, "#ef4444", "Stop")}
          {line(lines.target, "#22c55e", "Target")}
        </>
      )}
    </svg>
  );
}
