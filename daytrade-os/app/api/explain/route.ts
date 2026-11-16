export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "No ANTHROPIC_API_KEY set." }, { status: 400 });
  const { signal } = await req.json();
  const prompt = `You are a trading co-pilot. Explain this rule-based intraday signal to the trader in under 120 words: why it fired, the main risk, and what would invalidate it. The score is a rule checklist, not a win probability. Do not promise profit.\n\n${JSON.stringify(signal)}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const j = await r.json();
  if (!r.ok) return Response.json({ error: j.error?.message ?? "Claude API error" }, { status: 502 });
  return Response.json({ text: j.content?.[0]?.text ?? "" });
}
