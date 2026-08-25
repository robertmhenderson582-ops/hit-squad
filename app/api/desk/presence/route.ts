import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { pingPresence, takeArrivals } from "@/lib/presence";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { path?: string };
  pingPresence({ email: user.email, name: user.name, path: typeof body.path === "string" ? body.path : "/" });
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ arrivals: [] });
  return NextResponse.json({ arrivals: takeArrivals(user.email) });
}
