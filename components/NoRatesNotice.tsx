"use client";

import { useRouter } from "next/navigation";
import { assignedCompanyId, companyScopeFor } from "@/lib/companies";
import { NO_RATES_CHOICES, NO_RATES_NOTICE } from "@/lib/estimate-rates-gate";
import { importRateBuilderSheetToCompany } from "@/lib/rate-books";
import type { PublicUser } from "@/lib/types";

export function NoRatesNotice({
  user,
  onImported,
}: {
  user?: PublicUser | null;
  onImported?: () => void;
}) {
  const router = useRouter();
  const companyId = assignedCompanyId(companyScopeFor(user));

  return (
    <section className="plant-card border border-[#c5d4d4] px-5 py-4" data-testid="no-rates-notice">
      <p className="text-sm font-semibold text-[#163038]">{NO_RATES_NOTICE}</p>
      <p className="mt-1 text-sm text-[#5b6f73]">{NO_RATES_CHOICES}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="rounded-lg border border-steel px-4 py-2 text-sm text-steel">
          Upload billing rates
          <input
            className="sr-only"
            type="file"
            accept=".csv,.tsv,.txt"
            aria-label="Upload billing rates"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (/\.xlsx|\.xlsm|\.xls|\.pdf$/i.test(file.name)) return;
              void file.text().then((text) => {
                const imported = importRateBuilderSheetToCompany({
                  companyId,
                  text,
                  label: "Working book",
                  level: "company",
                });
                if (imported.crafts.length) onImported?.();
              });
            }}
          />
        </label>
        <button
          type="button"
          className="rounded-lg bg-steel px-4 py-2 text-sm text-white"
          onClick={() => router.push("/rates")}
        >
          Use Rate builder
        </button>
      </div>
    </section>
  );
}
