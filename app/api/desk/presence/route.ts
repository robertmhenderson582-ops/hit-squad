import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { hasBuildDesk } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";
import { addActivity } from "@/lib/activity-store";
import { beatPresence, listSeats, markSignedOut, pingPresence, seatFor, takeArrivals } from "@/lib/presence";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { path?: string; end?: string };
  const path = typeof body.path === "string" ? body.path : "/";
  if (body.end === "idle" || body.end === "sign-out") {
    const seat = seatFor(user.email);
    const mins = seat ? Math.max(1, Math.round((Date.now() - seat.startedAt) / 60000)) : 0;
    const last = screenName(seat?.path || path);
    await addActivity({
      kind: "session",
      who: user.name,
      detail: `${body.end === "sign-out" ? "Sign-out" : "Idle"} · ${last} · ${mins} min`,
    });
    if (body.end === "sign-out") markSignedOut(user.email);
    return NextResponse.json({ ok: true });
  }
  const first = pingPresence({ email: user.email, name: user.name, path });
  beatPresence({ email: user.email, name: user.name, path });
  if (first) {
    await addActivity({ kind: "session", who: user.name, detail: `Start · ${screenName(path)}` });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasBuildDesk(user)) return NextResponse.json({ arrivals: [], seats: [] });
  return NextResponse.json({
    arrivals: takeArrivals(user.email),
    seats: listSeats(user.email),
  });
}

function screenName(path: string) {
  if (path === "/") return "Home";
  if (path.startsWith("/estimates")) return "Estimates";
  if (path.startsWith("/jobs") || path.startsWith("/sites")) return "Jobs";
  if (path.startsWith("/rates")) return "Rates";
  if (path.startsWith("/tickets")) return "Tickets";
  if (path.startsWith("/settings")) return "Settings";
  return path.replace(/^\//, "") || "Home";
}
