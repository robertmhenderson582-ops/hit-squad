"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLensUser } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { isRateVaultOnlyViewer } from "@/lib/rate-vault";

const OPEN_PATHS = [/^\/rate-vault(?:\/|$)/, /^\/login(?:\/|$)/, /^\/settings(?:\/|$)/];

/** James Hutton’s seat is Rate Vault only — send Jobs / Inbox / other modules home to the vault. */
export function RateVaultOnlyRedirect() {
  const { user } = useSession();
  const lens = useLensUser();
  const router = useRouter();
  const pathname = usePathname() || "/";
  useEffect(() => {
    if (!isRateVaultOnlyViewer(lens || user)) return;
    if (OPEN_PATHS.some((path) => path.test(pathname))) return;
    router.replace("/rate-vault");
  }, [lens, pathname, router, user]);
  return null;
}
