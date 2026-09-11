"use client";

import { FieldBlock } from "@/components/FieldMark";
import {
  RATE_VAULT_B1_BURDEN_FAMILIES,
  RATE_VAULT_BOOK_FACE_LABEL,
  RATE_VAULT_BOOK_FACES,
  RATE_VAULT_SITES,
  packageBookFace,
  rateVaultSiteLabel,
  type RateVaultB1LineControls,
  type RateVaultBookFace,
  type RateVaultBurdenFamily,
  type RateVaultBurdenLine,
  type RateVaultCraftSheet,
  type RateVaultFringeLine,
  type RateVaultOcipFace,
  type RateVaultPreviewPackage,
} from "@/lib/rate-vault";
import {
  burdenLineAmount,
  burdenLinePct,
  craftSheetBurdenSubtotal,
  craftSheetFamilyAmount,
  craftSheetFringesSubtotal,
  fringeLineAmount,
} from "@/lib/rate-vault-b1";
import {
  RATE_VAULT_B1_BASE_LABEL,
  RATE_VAULT_B1_CALC_LABELS,
  RATE_VAULT_B1_MULT_LABEL,
  RATE_VAULT_B1_RATE_KIND_LABEL,
  RATE_VAULT_B1_RIDE_LABELS,
  rateVaultB1SelectOptions,
} from "@/lib/rate-vault-b1-options";
import {
  burdenTotalPct,
  filterPreviewByFace,
  formatRateVaultMoney,
  formatRateVaultPct,
  previewRowGroups,
} from "@/lib/rate-vault-preview";

const RATE_HEADERS = ["Position", "Lane", "Craft / local", "Wage", "Fringe", "Burden", "Bill ST", "Bill OT", "Bill DT"] as const;

const B1_CONTROL_HEADERS = [
  RATE_VAULT_B1_RATE_KIND_LABEL,
  RATE_VAULT_B1_BASE_LABEL,
  RATE_VAULT_B1_CALC_LABELS.st,
  RATE_VAULT_B1_CALC_LABELS.ot,
  RATE_VAULT_B1_CALC_LABELS.dt,
  RATE_VAULT_B1_MULT_LABEL,
  RATE_VAULT_B1_RIDE_LABELS.st,
  RATE_VAULT_B1_RIDE_LABELS.ot,
  RATE_VAULT_B1_RIDE_LABELS.dt,
] as const;

export type RateVaultB1LineHandler = (lineId: string, patch: Partial<RateVaultB1LineControls>) => void;

function B1Select({
  label,
  kind,
  value,
  disabled,
  onPick,
}: {
  label: string;
  kind: "rateKind" | "base" | "calc" | "ride";
  value: string;
  disabled?: boolean;
  onPick?: (value: string) => void;
}) {
  const options = rateVaultB1SelectOptions(kind, value);
  if (!onPick) return <span>{value || "—"}</span>;
  return (
    <select
      className="paper-field mt-0 max-w-[10rem] py-1 text-xs"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onPick(event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function B1ControlCells({
  line,
  disabled,
  onB1Line,
}: {
  line: RateVaultB1LineControls & { id: string; label: string };
  disabled?: boolean;
  onB1Line?: RateVaultB1LineHandler;
}) {
  const editable = Boolean(onB1Line);
  const name = line.label;
  return (
    <>
      <td className="px-2 py-1">
        <B1Select
          label={`${RATE_VAULT_B1_RATE_KIND_LABEL} — ${name}`}
          kind="rateKind"
          value={line.rateKind}
          disabled={disabled}
          onPick={editable ? (rateKind) => onB1Line?.(line.id, { rateKind }) : undefined}
        />
      </td>
      <td className="px-2 py-1">
        <B1Select
          label={`${RATE_VAULT_B1_BASE_LABEL} — ${name}`}
          kind="base"
          value={line.base}
          disabled={disabled}
          onPick={editable ? (base) => onB1Line?.(line.id, { base }) : undefined}
        />
      </td>
      <td className="px-2 py-1">
        <B1Select
          label={`${RATE_VAULT_B1_CALC_LABELS.st} — ${name}`}
          kind="calc"
          value={line.calcSt}
          disabled={disabled}
          onPick={editable ? (calcSt) => onB1Line?.(line.id, { calcSt }) : undefined}
        />
      </td>
      <td className="px-2 py-1">
        <B1Select
          label={`${RATE_VAULT_B1_CALC_LABELS.ot} — ${name}`}
          kind="calc"
          value={line.calcOt}
          disabled={disabled}
          onPick={editable ? (calcOt) => onB1Line?.(line.id, { calcOt }) : undefined}
        />
      </td>
      <td className="px-2 py-1">
        <B1Select
          label={`${RATE_VAULT_B1_CALC_LABELS.dt} — ${name}`}
          kind="calc"
          value={line.calcDt}
          disabled={disabled}
          onPick={editable ? (calcDt) => onB1Line?.(line.id, { calcDt }) : undefined}
        />
      </td>
      <td className="px-2 py-1">
        {editable ? (
          <input
            type="number"
            step="0.0001"
            className="paper-field mt-0 w-16 py-1 text-xs"
            aria-label={`${RATE_VAULT_B1_MULT_LABEL} — ${name}`}
            value={line.mult ?? ""}
            disabled={disabled}
            onChange={(event) => {
              const raw = event.target.value;
              onB1Line?.(line.id, { mult: raw === "" ? null : Number(raw) });
            }}
          />
        ) : (
          <span>{line.mult == null ? "—" : line.mult}</span>
        )}
      </td>
      <td className="px-2 py-1">
        <B1Select
          label={`${RATE_VAULT_B1_RIDE_LABELS.st} — ${name}`}
          kind="ride"
          value={line.rideSt ? "Y" : "N"}
          disabled={disabled}
          onPick={editable ? (value) => onB1Line?.(line.id, { rideSt: value === "Y" }) : undefined}
        />
      </td>
      <td className="px-2 py-1">
        <B1Select
          label={`${RATE_VAULT_B1_RIDE_LABELS.ot} — ${name}`}
          kind="ride"
          value={line.rideOt ? "Y" : "N"}
          disabled={disabled}
          onPick={editable ? (value) => onB1Line?.(line.id, { rideOt: value === "Y" }) : undefined}
        />
      </td>
      <td className="px-2 py-1">
        <B1Select
          label={`${RATE_VAULT_B1_RIDE_LABELS.dt} — ${name}`}
          kind="ride"
          value={line.rideDt ? "Y" : "N"}
          disabled={disabled}
          onPick={editable ? (value) => onB1Line?.(line.id, { rideDt: value === "Y" }) : undefined}
        />
      </td>
    </>
  );
}

function B1ControlHeads() {
  return (
    <>
      {B1_CONTROL_HEADERS.map((header) => (
        <th key={header} scope="col" className="px-2 py-1">
          {header}
        </th>
      ))}
    </>
  );
}

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

export function RateVaultBookPicker({
  book,
  onBook,
}: {
  book: RateVaultBookFace;
  onBook: (value: RateVaultBookFace) => void;
}) {
  return (
    <FieldBlock label="Book">
      <select
        className="paper-field mt-1"
        value={book}
        aria-label="Labor-burden book"
        onChange={(event) => onBook(event.target.value as RateVaultBookFace)}
      >
        {RATE_VAULT_BOOK_FACES.map((id) => (
          <option key={id} value={id}>
            {RATE_VAULT_BOOK_FACE_LABEL[id]}
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

function familyLabel(id: RateVaultBurdenFamily) {
  return RATE_VAULT_B1_BURDEN_FAMILIES.find((row) => row.id === id)?.label ?? id;
}

function CraftSheetBurden({
  sheet,
  onB1Line,
}: {
  sheet: RateVaultCraftSheet;
  onB1Line?: RateVaultB1LineHandler;
}) {
  const wage = sheet.representativeWage;
  const fringeTotal = craftSheetFringesSubtotal(sheet, wage);
  const burdenTotal = craftSheetBurdenSubtotal(sheet, wage);
  const visibleFringes = sheet.fringes.filter((line) => fringeLineAmount(line, wage) || line.unit === "pct-taxable");
  return (
    <section className="rounded-lg border border-[#d5e0de] px-3 py-3">
      <p className="text-xs tracking-[0.12em] text-[#5b6f73]">{sheet.sheet}</p>
      <h5 className="text-base font-semibold text-[#163038]">
        {sheet.craft}
        {sheet.local ? ` · L ${sheet.local}` : ""}
        {sheet.lane === "merit" ? " · merit" : ""}
      </h5>
      <p className="mt-1 text-sm text-[#5b6f73]">
        {sheet.representativePosition} @ {formatRateVaultMoney(wage)} taxable BW · Fringes Subtotal{" "}
        {formatRateVaultMoney(fringeTotal)} / hr · burden {formatRateVaultMoney(burdenTotal)} (
        {formatRateVaultPct(wage ? (burdenTotal / wage) * 100 : 0)} of BW)
      </p>

      <p className="mt-3 text-xs tracking-[0.12em] text-[#5b6f73]">Fringes Subtotal — $ / hr</p>
      <div className="overflow-x-auto">
        <table className="mt-1 min-w-full text-left text-sm" aria-label={`${sheet.craft} B-1 fringes`}>
          <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
            <tr>
              <th scope="col" className="px-2 py-1">
                Fringe
              </th>
              <th scope="col" className="px-2 py-1">
                $ / hr
              </th>
              <th scope="col" className="px-2 py-1">
                of BW
              </th>
              <B1ControlHeads />
            </tr>
          </thead>
          <tbody>
            {visibleFringes.map((line: RateVaultFringeLine) => {
              const amount = fringeLineAmount(line, wage);
              return (
                <tr key={line.id} className="border-t border-[#d5e0de]">
                  <td className="px-2 py-1 font-semibold text-[#163038]">{line.label}</td>
                  <td className="px-2 py-1 font-semibold">{formatRateVaultMoney(amount)}</td>
                  <td className="px-2 py-1 text-[#5b6f73]">
                    {line.unit === "pct-taxable" ? formatRateVaultPct(line.ratePct) : "—"}
                  </td>
                  <B1ControlCells line={line} onB1Line={onB1Line} />
                </tr>
              );
            })}
            <tr className="border-t border-[#d5e0de]">
              <td className="px-2 py-1 font-semibold">Fringes Subtotal</td>
              <td className="px-2 py-1 font-semibold">{formatRateVaultMoney(fringeTotal)}</td>
              <td className="px-2 py-1">—</td>
              {B1_CONTROL_HEADERS.map((header) => (
                <td key={header} className="px-2 py-1">
                  —
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {RATE_VAULT_B1_BURDEN_FAMILIES.map((family) => {
        const lines = sheet.burden.filter((line) => line.family === family.id);
        if (!lines.length) return null;
        const subtotal = craftSheetFamilyAmount(sheet, family.id, wage);
        return (
          <div key={family.id} className="mt-3">
            <p className="text-xs tracking-[0.12em] text-[#5b6f73]">{family.label}</p>
            <div className="overflow-x-auto">
              <table className="mt-1 min-w-full text-left text-sm" aria-label={`${sheet.craft} B-1 ${family.label}`}>
                <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                  <tr>
                    <th scope="col" className="px-2 py-1">
                      Item
                    </th>
                    <th scope="col" className="px-2 py-1">
                      Rate
                    </th>
                    <th scope="col" className="px-2 py-1">
                      $ / hr
                    </th>
                    <B1ControlHeads />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line: RateVaultBurdenLine) => (
                    <tr key={line.id} className="border-t border-[#d5e0de]">
                      <td className="px-2 py-1 font-semibold text-[#163038]">{line.label}</td>
                      <td className="px-2 py-1 font-semibold">{formatRateVaultPct(burdenLinePct(line, wage))}</td>
                      <td className="px-2 py-1 font-semibold">{formatRateVaultMoney(burdenLineAmount(line, wage))}</td>
                      <B1ControlCells line={line} onB1Line={onB1Line} />
                    </tr>
                  ))}
                  <tr className="border-t border-[#d5e0de]">
                    <td className="px-2 py-1 font-semibold">{familyLabel(family.id)} subtotal</td>
                    <td className="px-2 py-1">—</td>
                    <td className="px-2 py-1 font-semibold">{formatRateVaultMoney(subtotal)}</td>
                    {B1_CONTROL_HEADERS.map((header) => (
                      <td key={header} className="px-2 py-1">
                        —
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function RateVaultPreviewTables({
  preview,
  siteId,
  emptyNote,
  ocipFace = "both",
  onB1Line,
}: {
  preview: RateVaultPreviewPackage | null;
  siteId: string;
  emptyNote: string;
  ocipFace?: RateVaultOcipFace | "both";
  onB1Line?: RateVaultB1LineHandler;
}) {
  const viewed = preview && ocipFace !== "both" ? filterPreviewByFace(preview, ocipFace) : preview;
  if (!viewed || !viewed.rows.length) {
    if (viewed && packageBookFace(viewed) === "tm") {
      return (
        <div className="mt-4 space-y-2">
          <p className="text-xs tracking-[0.14em] text-[#5b6f73]">T&M labor-burden book</p>
          <h4 className="text-lg font-semibold text-[#163038]">{viewed.title}</h4>
          {viewed.note ? <p className="text-sm leading-6 text-[#5b6f73]">{viewed.note}</p> : null}
          <p className="text-sm text-[#5b6f73]">
            {emptyNote ||
              `No T&M seats in this view. Switch OCIP or pick RRFF for the other Wood River book.`}
          </p>
        </div>
      );
    }
    return (
      <p className="mt-4 text-sm text-[#5b6f73]">
        {emptyNote || `No B-1 preview for ${rateVaultSiteLabel(siteId) || "this site"} yet.`}
      </p>
    );
  }

  const groups = previewRowGroups(viewed.rows);
  const payTaxPct = burdenTotalPct(viewed);
  const halls = viewed.craftSheets ?? [];

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
          {` · ${packageBookFace(viewed) === "tm" ? "T&M" : "RRFF"}`}
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
        <p className="text-xs tracking-[0.14em] text-[#5b6f73]">Exhibit B-1 craft sheets</p>
        <h4 className="text-lg font-semibold text-[#163038]">Burden + fringes</h4>
        <p className="mt-1 text-sm text-[#5b6f73]">
          Pay Tax FICA-MC / FUI / SUI {formatRateVaultPct(payTaxPct)} of taxable BW on every Wood River hall sheet.
          Insurance, misc, O/H, and profit stay on the craft sheet — not a site-wide Illinois composite. Fringes
          Subtotal is $ / hr, hall by hall. Rate $/%/Varies, Base (Base Wage / Tax BW), ST Calc / OT Calc / DT Calc,
          Mult, and Ride ST / Ride OT / Ride DT are the Exhibit B-1 builder controls — Hours Worked, Hours Paid,
          Straight Time, Y, N, and Varies stay first-class, not a three-way shorthand.
        </p>
        {halls.length ? (
          <div className="mt-3 grid gap-4">
            {halls.map((sheet) => (
              <CraftSheetBurden key={sheet.id} sheet={sheet} onB1Line={onB1Line} />
            ))}
          </div>
        ) : viewed.burden.length || viewed.fringes?.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm" aria-label="Wood River B-1 burden summary">
              <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                <tr>
                  <th scope="col" className="px-2 py-2">
                    Family
                  </th>
                  <th scope="col" className="px-2 py-2">
                    Item
                  </th>
                  <th scope="col" className="px-2 py-2">
                    Rate
                  </th>
                  <th scope="col" className="px-2 py-2">
                    $ / hr
                  </th>
                  <th scope="col" className="px-2 py-2">
                    Hall
                  </th>
                  <B1ControlHeads />
                </tr>
              </thead>
              <tbody>
                {viewed.burden.map((line) => (
                  <tr key={line.id} className="border-t border-[#d5e0de]">
                    <td className="px-2 py-2 text-[#5b6f73]">{familyLabel(line.family)}</td>
                    <td className="px-2 py-2 font-semibold text-[#163038]">{line.label}</td>
                    <td className="px-2 py-2 font-semibold">{formatRateVaultPct(line.ratePct)}</td>
                    <td className="px-2 py-2 font-semibold">{line.amountHr ? formatRateVaultMoney(line.amountHr) : "—"}</td>
                    <td className="px-2 py-2 text-[#5b6f73]">{line.sheet || line.craft || "—"}</td>
                    <B1ControlCells line={line} onB1Line={onB1Line} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
