import { connection } from "next/server";
import { brokerConfigured, isLive } from "@/lib/broker";
import { INSTRUMENTS } from "@/lib/instruments";

export async function GET() {
  await connection();
  return Response.json({
    instruments: INSTRUMENTS.map(({ symbol, name, kind, sessionLabel, tradable }) => ({ symbol, name, kind, sessionLabel, tradable })),
    broker: { configured: brokerConfigured(), live: isLive() },
    explainer: !!process.env.ANTHROPIC_API_KEY,
  });
}
