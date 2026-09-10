"use client";

import { FieldBlock } from "@/components/FieldMark";
import {
  RATE_VAULT_SITES,
  rateVaultSiteLabel,
  type RateVaultOcipFace,
  type RateVaultPreviewPackage,
} from "@/lib/rate-vault";
import {
  burdenTotalPct,
  filterPreviewByFace,
  formatRateVaultMoney,
  formatRateVaultPct,
  previewRowGroups,
} from "@/lib/rate-vault-preview";

const RATE_HEADERS = ["Position", "Lane", "Craft / local", "Wage", "Fringe", "Burden", "Bill ST", "Bill OT", "Bill DT"] as const;

export function RateVaultSitePicker({
  siteId,
  onSite,
  label = "Site",
}: {
  siteId: string;
  onSite: (value: string) => void;
  label?: string;
}) {
  return (
    <FieldBlock label={label}>
      <select
        className="paper-field mt-1"
        value={siteId}
        aria-label="Rate package site"
        onChange={(event) => onSite(event.target.value)}
      >
        {RATE_VAULT_SITES.map((site) => (
          <option key={site.id} value={site.id}>
            {site.label}
          </option>
        ))}
      </select>
    </FieldBlock>
  );
}

export function RateVaultOcipPicker({
  face,
  onFace,
}: {
  face: RateVaultOcipFace | "both";
  onFace: (value: RateVaultOcipFace | "both") => void;
}) {
  return (
    <FieldBlock label="OCIP face">
      <select
        className="paper-field mt-1"
        value={face}
        aria-label="OCIP face"
        onChange={(event) => onFace(event.target.value as RateVaultOcipFace | "both")}
      >
        <option value="both">OCIP and non-OCIP</option>
        <option value="ocip">OCIP</option>
        <option value="non-ocip">non-OCIP</option>
      </select>
    </FieldBlock>
  );
}

export function RateVaultPreviewTables({
  preview,
  siteId,
  emptyNote,
  ocipFace = "both",
}: {
  preview: RateVaultPreviewPackage | null;
  siteId: string;
  emptyNote: string;
  ocipFace?: RateVaultOcipFace | "both";
}) {
  const viewed = preview && ocipFace !== "both" ? filterPreviewByFace(preview, ocipFace) : preview;
  if (!viewed || !viewed.rows.length) {
    return (
      <p className="mt-4 text-sm text-[#5b6f73]">
        {emptyNote || `No B-1 preview for ${rateVaultSiteLabel(siteId) || "this site"} yet.`}
      </p>
    );
  }

  const groups = previewRowGroups(viewed.rows);
  const burdenPct = burdenTotalPct(viewed);

  return (
    <div className="mt-4 space-y-6">
      <div>
        <p className="text-xs tracking-[0.14em] text-[#5b6f73]">Visual rate package</p>
        <h4 className="text-lg font-semibold text-[#163038]">{viewed.title}</h4>
        <p className="mt-1 text-sm leading-6 text-[#5b6f73]">
          {rateVaultSiteLabel(viewed.siteId)}
          {viewed.revision ? ` · ${viewed.revision}` : ""}
          {viewed.effective ? ` · effective ${viewed.effective}` : ""}
          {" · "}
          {viewed.rows.length} positions
          {ocipFace !== "both" ? ` · ${ocipFace}` : ""}
          {viewed.fixture
            ? " · fixture"
            : viewed.extractedFrom === "vault-xlsx-import"
              ? " · imported B-1 Excel"
              : ""}
          {viewed.version ? ` · ${viewed.version.note} ${viewed.version.at.slice(0, 10)}` : ""}
        </p>
        {viewed.note ? <p className="mt-2 text-sm leading-6 text-[#5b6f73]">{viewed.note}</p> : null}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm" aria-label="Wood River B-1 rate package">
          <caption className="sr-only">
            {viewed.title} — positions with wage, fringe, burden, and bill rate
          </caption>
          <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
            <tr>
              {RATE_HEADERS.map((header) => (
                <th key={header} scope="col" className="px-2 py-2">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.name}>
              <tr className="border-t border-[#d5e0de]">
                <th scope="colgroup" colSpan={RATE_HEADERS.length} className="px-2 py-2 text-xs tracking-[0.12em] text-[#5b6f73]">
                  {group.name}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.id} className="border-t border-[#d5e0de]">
                  <td className="px-2 py-2 font-semibold text-[#163038]">{row.position}</td>
                  <td className="px-2 py-2 text-[#5b6f73]">{row.lane}</td>
                  <td className="px-2 py-2 text-[#5b6f73]">
                    {row.craft}
                    {row.local ? ` · L ${row.local}` : ""}
                  </td>
                  <td className="px-2 py-2 font-semibold">{formatRateVaultMoney(row.wage)}</td>
                  <td className="px-2 py-2 font-semibold">{formatRateVaultMoney(row.fringe)}</td>
                  <td className="px-2 py-2 font-semibold">{formatRateVaultMoney(row.burden)}</td>
                  <td className="px-2 py-2 font-semibold">{formatRateVaultMoney(row.billRate)}</td>
                  <td className="px-2 py-2">{row.billOt != null ? formatRateVaultMoney(row.billOt) : "—"}</td>
                  <td className="px-2 py-2">{row.billDt != null ? formatRateVaultMoney(row.billDt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <div>
        <p className="text-xs tracking-[0.14em] text-[#5b6f73]">Burden Summary</p>
        <h4 className="text-lg font-semibold text-[#163038]">Burden stack</h4>
        <p className="mt-1 text-sm text-[#5b6f73]">Composite {formatRateVaultPct(burdenPct)} of taxable wage — hall sheets still vary.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm" aria-label="Wood River B-1 burden summary">
            <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
              <tr>
                <th scope="col" className="px-2 py-2">
                  Item
                </th>
                <th scope="col" className="px-2 py-2">
                  Rate
                </th>
                <th scope="col" className="px-2 py-2">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {viewed.burden.map((line) => (
                <tr key={line.id} className="border-t border-[#d5e0de]">
                  <td className="px-2 py-2 font-semibold text-[#163038]">{line.label}</td>
                  <td className="px-2 py-2 font-semibold">{formatRateVaultPct(line.ratePct)}</td>
                  <td className="px-2 py-2 text-[#5b6f73]">{line.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
