import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { assignedCompany } from "@/lib/companies-store";
import { cookieValue } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  return NextResponse.json(
    { user, companyId: user ? assignedCompany(user.email) : null },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
