import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { assignedCompany } from "@/lib/companies-store";
import { cookieValue } from "@/lib/http";
import { boardForUser } from "@/lib/desk-data";
import { scopedDeskUser } from "@/lib/desk-scope-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const deskUser = await scopedDeskUser(user, request);
  const companyId = await assignedCompany(deskUser.email);
  const scope = { isOwner: deskUser.role === "owner", email: deskUser.email, companyId };

  return NextResponse.json({
    user: { id: deskUser.id, email: deskUser.email, name: deskUser.name },
    board: boardForUser(deskUser.id, scope),
    companyId,
  });
}
