import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { companyScopeFor } from "@/lib/companies";
import { assignedCompanyForUser } from "@/lib/companies-store";
import { cookieValue } from "@/lib/http";
import { boardForUser } from "@/lib/desk-data";
import { getOwnerSettings } from "@/lib/owner-settings-store";
import { scopedDeskUser } from "@/lib/desk-scope-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const deskUser = await scopedDeskUser(user, request);
  await getOwnerSettings();
  const companyId = await assignedCompanyForUser(deskUser);
  const scope = companyScopeFor(deskUser, companyId);

  return NextResponse.json({
    user: { id: deskUser.id, email: deskUser.email, name: deskUser.name },
    board: boardForUser(deskUser.id, scope),
    companyId,
  });
}
