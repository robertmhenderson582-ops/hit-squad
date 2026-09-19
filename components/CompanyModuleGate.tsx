"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import type { Company, CompanyModuleKey } from "@/lib/companies";
import { viewAsInit } from "@/lib/desk-scope";
import { canOpenCompanyModule, companyModuleDenied } from "@/lib/module-access";

export function CompanyModuleGate({
  module,
  children,
}: {
  module: CompanyModuleKey;
  children: ReactNode;
}) {
  const { user } = useSession();
  const desk = useOwnerDesk();
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    setBlocked(null);
    let cancelled = false;
    fetch("/api/desk/companies", viewAsInit(desk?.viewAs))
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          company?: Company | null;
          companies?: Company[];
          companyId?: string;
        };
        if (cancelled) return;
        const listed = Array.isArray(data.companies) ? data.companies : [];
        const company =
          data.company || listed.find((item) => item.id === data.companyId) || null;
        if (!canOpenCompanyModule(user, company, module)) {
          setBlocked(companyModuleDenied(module));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [desk?.viewAs, module, user]);

  if (blocked) {
    return <section className="plant-card px-5 py-5 text-[#5b6f73]">{blocked}</section>;
  }
  return children;
}
