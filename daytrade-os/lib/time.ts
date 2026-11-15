const parts = (utc: number) => {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(utc))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o;
};

/** Convert a New York wall-clock time to a UTC timestamp (handles DST). */
export function nyToUtc(y: number, mo: number, d: number, h: number, mi: number): number {
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = parts(guess);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute);
    guess += Date.UTC(y, mo - 1, d, h, mi) - asUtc;
  }
  return guess;
}
