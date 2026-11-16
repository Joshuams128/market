import { connection } from "next/server";
import { brokerConfigured, getAccount, isLive } from "@/lib/broker";


export async function GET() {
  await connection();
  if (!brokerConfigured()) return Response.json({ configured: false, live: false });
  try {
    const a = await getAccount();
    return Response.json({ configured: true, live: isLive(), equity: Number(a.equity), buyingPower: Number(a.buying_power), status: a.status });
  } catch (e) {
    return Response.json({ configured: true, live: isLive(), error: (e as Error).message }, { status: 502 });
  }
}
