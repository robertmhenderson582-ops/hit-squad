import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { canSeeRateVault } from "@/lib/desk-role";

export default async function RateVaultLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await readSession(token);
  if (!user) redirect("/login");
  if (!canSeeRateVault(user)) redirect("/");
  return children;
}
