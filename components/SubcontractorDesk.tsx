"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirmRemove } from "@/components/ConfirmDialog";
import { CrewPhaseCards } from "@/components/CrewPhaseCards";
import { GripToPan } from "@/components/GripToPan";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { clampPerDiem, type CalendarRange } from "@/lib/craft-labor";
import {
  SUB_CARD_KINDS,
  SUB_EQUIP_PERIODS,
  SUB_EQUIP_PERIOD_LABEL,
  SUB_UNIT_LABEL,
  oneOffUnitsFor,
  applyBookRate,
  applyTypedAmount,
  blankSubCard,
  blankSubEquipLine,
  blankSubLaborPosition,
  blankSubLine,
  blankSubRate,
  bookLabel,
  cardShowsEquipment,
  cardShowsLabor,
  emptySubBook,
  emptySubSheet,
  lineAmount,
  readSubBook,
  readSubSheet,
  subCardTotal,
  subEquipAmount,
  subLaborAsCraftRow,
  subLaborCost,
  subLaborHours,
  subcontractorTotal,
  syncSubSheet,
  writeSubBook,
  writeSubSheet,
  type SubCard,
  type SubCardKind,
  type SubEquipLine,
  type SubEquipPeriod,
  type SubLaborPosition,
  type SubLine,
  type SubRate,
  type SubSheet,
  type SubUnit,
} from "@/lib/subcontractor";

function money(value: number) {
  return value ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
}

const ADD_BTN = "rounded-lg bg-steel px-3 py-1.5 text-sm text-white";
const HEADERS = ["VENDOR", "SCOPE", "AMOUNT", ""];

function Chevron({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={open ? "Collapse" : "Expand"}
      aria-label={open ? "Collapse" : "Expand"}
      aria-expanded={open}
      className="crew-chevron"
    >
      <svg className="crew-chevron-icon" viewBox="0 0 24 24" aria-hidden="true">
        {open ? (
          <path
            d="M6 9.5 12 15.5 18 9.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M9.5 6 15.5 12 9.5 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <span className="crew-chevron-label">{open ? "Collapse" : "Expand"}</span>
    </button>
  );
}

export function SubcontractorRateBook({
  book: controlled,
  onChange,
}: {
  book?: SubRate[];
  onChange?: (next: SubRate[]) => void;
} = {}) {
  const [local, setLocal] = useState<SubRate[]>(emptySubBook);
  const confirmRemove = useConfirmRemove();
  const book = controlled ?? local;

  useEffect(() => {
    if (controlled) return;
    setLocal(readSubBook());
  }, [controlled]);

  function persist(next: SubRate[]) {
    if (!controlled) setLocal(next);
    onChange?.(next);
    writeSubBook(next);
  }

  return (
    <section className="plant-card px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[#163038]">Subcontractor rates</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#5b6f73]">
            Plug your own vendors. Empty is fine. Estimators pick a row on the Subcontractor tab or
            type a one-off. No canned list.
          </p>
        </div>
        <button type="button" onClick={() => persist([...book, blankSubRate()])} className={ADD_BTN}>
          + Add rate
        </button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
            <tr>
              {["VENDOR / SUB", "SCOPE / SERVICE", "UNIT", "RATE", ""].map((header) => (
                <th key={header} className="px-2 py-2">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {book.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-[#5b6f73]">
                  No plugged rates yet. Add rate and type the vendor.
                </td>
              </tr>
            ) : (
              book.map((row, index) => (
                <tr key={row.id} className="border-t border-[#d5e0de]">
                  <td className="px-2 py-2">
                    <input
                      className="paper-field min-w-[12rem]"
                      value={row.vendor}
                      onChange={(event) => {
                        const next = book.slice();
                        next[index] = { ...row, vendor: event.target.value };
                        persist(next);
                      }}
                      aria-label="Vendor or sub name"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className="paper-field min-w-[14rem]"
                      value={row.scope}
                      onChange={(event) => {
                        const next = book.slice();
                        next[index] = { ...row, scope: event.target.value };
                        persist(next);
                      }}
                      aria-label="Scope or service"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="paper-field"
                      value={row.unit}
                      onChange={(event) => {
                        const next = book.slice();
                        next[index] = { ...row, unit: event.target.value as SubUnit };
                        persist(next);
                      }}
                      aria-label="Unit"
                    >
                      {oneOffUnitsFor(row.unit).map((unit) => (
                        <option key={unit} value={unit}>
                          {SUB_UNIT_LABEL[unit]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      className="paper-field w-28"
                      value={row.rate || ""}
                      onChange={(event) => {
                        const next = book.slice();
                        next[index] = { ...row, rate: Number(event.target.value) || 0 };
                        persist(next);
                      }}
                      aria-label="Rate"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      className="trash-btn"
                      title="Remove rate"
                      aria-label="Remove rate"
                      onClick={() =>
                        void confirmRemove(row.vendor || row.scope || "this rate", {
                          title: "Remove this rate?",
                          confirmLabel: "Remove",
                        }).then((ok) => {
                          if (ok) persist(book.filter((item) => item.id !== row.id));
                        })
                      }
                    >
                      ⌫
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SubcontractorDesk({ site = "", client = "" }: { site?: string; client?: string } = {}) {
  const pack = useEstimatePackage();
  const confirmRemove = useConfirmRemove();
  const [sheet, setSheet] = useState<SubSheet>(emptySubSheet);
  const [book, setBook] = useState<SubRate[]>(emptySubBook);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [openCardIds, setOpenCardIds] = useState<string[]>([]);
  const ctx = useMemo(
    () => ({ site, client, otAfter8: pack.crew.otAfter8 }),
    [client, pack.crew.otAfter8, site],
  );
  const total = subcontractorTotal(sheet, ctx);

  useEffect(() => {
    const next = syncSubSheet(
      readSubSheet(pack.estimateKey),
      pack.schedule.phases,
      pack.schedule.units ?? [],
      Boolean(pack.schedule.multiUnits),
    );
    setSheet(next);
    setOpenIds(next.lines.filter((line) => !line.vendor && !line.scope && !line.rate).map((line) => line.id));
    setOpenCardIds(next.cards.filter((card) => !card.vendor).map((card) => card.id));
    setBook(readSubBook());
  }, [pack.estimateKey, pack.schedule.multiUnits, pack.schedule.phases, pack.schedule.units]);

  function persist(next: SubSheet) {
    const synced = syncSubSheet(next, pack.schedule.phases, pack.schedule.units ?? [], Boolean(pack.schedule.multiUnits));
    setSheet(synced);
    writeSubSheet(pack.estimateKey, synced);
  }

  function patch(index: number, nextLine: SubLine) {
    const next = sheet.lines.slice();
    next[index] = nextLine;
    persist({ ...sheet, lines: next });
  }

  function addRow() {
    const line = blankSubLine();
    persist({ ...sheet, lines: [...sheet.lines, line] });
    setOpenIds((current) => [...current, line.id]);
  }

  function addCard() {
    const card = blankSubCard();
    persist({ ...sheet, cards: [...sheet.cards, card] });
    setOpenCardIds((current) => [...current, card.id]);
  }

  function persistCard(index: number, nextCard: SubCard) {
    const cards = sheet.cards.slice();
    cards[index] = nextCard;
    persist({ ...sheet, cards });
  }

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Subcontractor. Labor lives on a vendor card: typed ST / OT / DT and hours from the Job
        setup calendar, same as Crew. Equipment is typed rows on that card — optional start/end
        uses date-span math. Same vendor can carry both. One-off LS / day / each rows stay for
        lump or unit price. Hour labor is not Qty × Rate. Not Crew labor and not Other Cost misc.
      </p>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-[#163038]">Subcontractor cards</h2>
          <button type="button" onClick={addCard} className={ADD_BTN}>
            + Add card
          </button>
        </div>
        {sheet.cards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#d5e0de] px-4 py-4 text-sm text-[#5b6f73]">
            No vendor cards yet. Add card, type the vendor, then add labor positions and/or
            equipment rows.
          </p>
        ) : (
          sheet.cards.map((card, index) => (
            <SubVendorCard
              key={card.id}
              card={card}
              site={site}
              client={client}
              otAfter8={pack.crew.otAfter8}
              open={openCardIds.includes(card.id)}
              onToggle={() =>
                setOpenCardIds((current) =>
                  current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id],
                )
              }
              onChange={(next) => persistCard(index, next)}
              onRemove={() =>
                void confirmRemove(card.vendor || "this card", {
                  title: "Remove this card?",
                  confirmLabel: "Remove",
                }).then((ok) => {
                  if (!ok) return;
                  persist({ ...sheet, cards: sheet.cards.filter((item) => item.id !== card.id) });
                  setOpenCardIds((current) => current.filter((id) => id !== card.id));
                })
              }
            />
          ))
        )}
      </section>

      <section className="plant-card px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-[#163038]">One-off rows</h2>
          <button type="button" onClick={addRow} className={ADD_BTN}>
            + Add row
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
              <tr>
                {HEADERS.map((header) => (
                  <th key={header || "actions"} className="px-2 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-[#5b6f73]">
                    No one-off rows. Add row to pick a book rate or type LS / day / each. Hour
                    labor goes on a vendor card.
                  </td>
                </tr>
              ) : (
                sheet.lines.map((line, index) => {
                  const open = openIds.includes(line.id);
                  return (
                    <SubRow
                      key={line.id}
                      line={line}
                      book={book}
                      open={open}
                      onToggle={() =>
                        setOpenIds((current) =>
                          current.includes(line.id)
                            ? current.filter((id) => id !== line.id)
                            : [...current, line.id],
                        )
                      }
                      onChange={(next) => patch(index, next)}
                      onRemove={() =>
                        void confirmRemove(line.vendor || line.scope || "this row", {
                          title: "Remove this row?",
                          confirmLabel: "Remove",
                        }).then((ok) => {
                          if (!ok) return;
                          persist({ ...sheet, lines: sheet.lines.filter((item) => item.id !== line.id) });
                          setOpenIds((current) => current.filter((id) => id !== line.id));
                        })
                      }
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <SubcontractorRateBook book={book} onChange={setBook} />

      <p className="text-sm font-semibold text-[#163038]">Subcontractor {money(total)}</p>
    </div>
  );
}

function SubRow({
  line,
  book,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  line: SubLine;
  book: SubRate[];
  open: boolean;
  onToggle: () => void;
  onChange: (next: SubLine) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <tr className="border-t border-[#d5e0de] align-top">
        <td className="px-2 py-2">
          <div className="flex items-center gap-2">
            <Chevron open={open} onToggle={onToggle} />
            <span className="min-w-[10rem] font-semibold text-[#163038]">{line.vendor || "—"}</span>
          </div>
        </td>
        <td className="px-2 py-2 text-[#163038]">{line.scope || "—"}</td>
        <td className="hud-readout px-2 py-2 font-semibold">{money(lineAmount(line))}</td>
        <td className="px-2 py-2">
          <button type="button" onClick={onRemove} title="Remove row" aria-label="Remove row" className="trash-btn">
            ⌫
          </button>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={4} className="bg-[#f4f1e8] px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-sm sm:col-span-2">
                Book rate
                <select
                  className="paper-field mt-1"
                  value={line.bookId && book.some((row) => row.id === line.bookId) ? line.bookId : ""}
                  onChange={(event) => {
                    const picked = book.find((row) => row.id === event.target.value);
                    onChange(picked ? applyBookRate(line, picked) : { ...line, bookId: undefined });
                  }}
                >
                  <option value="">{book.length ? "Pick a plugged rate or type a one-off" : "No plugged rates — type a one-off"}</option>
                  {book.map((row) => (
                    <option key={row.id} value={row.id}>
                      {bookLabel(row)} · {SUB_UNIT_LABEL[row.unit]} {row.rate || "—"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Vendor / sub
                <input
                  className="paper-field mt-1"
                  value={line.vendor}
                  onChange={(event) => onChange({ ...line, vendor: event.target.value })}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                Description / scope
                <input
                  className="paper-field mt-1"
                  value={line.scope}
                  onChange={(event) => onChange({ ...line, scope: event.target.value })}
                />
              </label>
              <label className="block text-sm">
                Qty
                <input
                  type="number"
                  min={0}
                  className="paper-field mt-1"
                  value={line.qty}
                  onChange={(event) => onChange({ ...line, qty: Number(event.target.value) || 0 })}
                />
              </label>
              <label className="block text-sm">
                Unit
                <select
                  className="paper-field mt-1"
                  value={line.unit}
                  onChange={(event) => {
                    const unit = event.target.value as SubUnit;
                    onChange({ ...line, unit, qty: unit === "LS" && !(line.qty > 0) ? 1 : line.qty });
                  }}
                >
                  {oneOffUnitsFor(line.unit).map((unit) => (
                    <option key={unit} value={unit}>
                      {SUB_UNIT_LABEL[unit]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Rate
                <input
                  type="number"
                  min={0}
                  className="paper-field mt-1"
                  value={line.rate || ""}
                  onChange={(event) => onChange({ ...line, rate: Number(event.target.value) || 0 })}
                />
              </label>
              <label className="block text-sm">
                Amount
                <input
                  type="number"
                  min={0}
                  className="paper-field mt-1"
                  value={lineAmount(line) || ""}
                  onChange={(event) => onChange(applyTypedAmount(line, Number(event.target.value) || 0))}
                />
              </label>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

const KIND_LABEL: Record<SubCardKind, string> = {
  labor: "Labor",
  equipment: "Equipment",
  both: "Labor + equipment",
};

const LABOR_HEADERS = ["POSITION", "ST RATE", "OT RATE", "DT RATE", "ST", "OT", "DT", "HOURS", "COST", ""];
const EQUIP_HEADERS = ["DESCRIPTION", "PERIOD", "RATE", "QTY", "START", "END", "FREIGHT", "TOTAL", ""];

function SubVendorCard({
  card,
  site,
  client,
  otAfter8,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  card: SubCard;
  site: string;
  client: string;
  otAfter8: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (next: SubCard) => void;
  onRemove: () => void;
}) {
  const pack = useEstimatePackage();
  const confirmRemove = useConfirmRemove();
  const [openLaborIds, setOpenLaborIds] = useState<string[]>([]);
  const amount = subCardTotal(card, { site, client, otAfter8 });

  function addLabor() {
    const row = blankSubLaborPosition(pack.schedule.phases, pack.schedule.units ?? [], Boolean(pack.schedule.multiUnits));
    onChange({ ...card, labor: [...card.labor, row] });
    setOpenLaborIds((current) => [...current, row.id]);
  }

  function patchLabor(index: number, next: SubLaborPosition) {
    const labor = card.labor.slice();
    labor[index] = next;
    onChange({ ...card, labor });
  }

  function patchLaborRange(rowId: string, rangeId: string, patch: Partial<CalendarRange>) {
    onChange({
      ...card,
      labor: card.labor.map((row) => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          ranges: row.ranges.map((range) => {
            if (range.id !== rangeId) return range;
            const next = { ...range, ...patch };
            return clampPerDiem(next, next.shift ?? row.shift);
          }),
        };
      }),
    });
  }

  function addEquip() {
    onChange({ ...card, equipment: [...card.equipment, blankSubEquipLine()] });
  }

  function patchEquip(index: number, next: SubEquipLine) {
    const equipment = card.equipment.slice();
    equipment[index] = next;
    onChange({ ...card, equipment });
  }

  return (
    <section className="plant-card px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Chevron open={open} onToggle={onToggle} />
          <input
            className="paper-field min-w-[14rem] font-semibold"
            value={card.vendor}
            onChange={(event) => onChange({ ...card, vendor: event.target.value })}
            aria-label="Vendor or sub name"
            placeholder="Vendor / sub"
          />
          <label className="text-xs text-[#5b6f73]">
            Card
            <select
              className="paper-field mt-1"
              value={card.kind}
              onChange={(event) => onChange({ ...card, kind: event.target.value as SubCardKind })}
              aria-label="Labor, equipment, or both"
            >
              {SUB_CARD_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <p className="hud-readout text-sm font-semibold">{money(amount)}</p>
          <button type="button" onClick={onRemove} title="Remove card" aria-label="Remove card" className="trash-btn">
            ⌫
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-4 space-y-5">
          {cardShowsLabor(card.kind) ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl font-semibold text-[#163038]">Labor</h3>
                  <p className="text-xs text-[#5b6f73]">
                    Type the title. Type ST / OT / DT. Hours follow Job setup phases like Crew.
                  </p>
                </div>
                <button type="button" onClick={addLabor} className={ADD_BTN}>
                  + Add position
                </button>
              </div>
              <GripToPan className="mt-3">
                <table className="min-w-[1100px] text-left text-sm">
                  <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                    <tr>
                      {LABOR_HEADERS.map((header) => (
                        <th key={header || "actions"} className="whitespace-nowrap px-2 py-2">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {card.labor.length === 0 ? (
                      <tr className="border-t border-[#d5e0de]">
                        <td colSpan={10} className="px-2 py-4 text-sm text-[#5b6f73]">
                          No labor positions. Add position and type the title.
                        </td>
                      </tr>
                    ) : (
                      card.labor.map((row, index) => {
                        const hours = subLaborHours(row, site, client, otAfter8);
                        const cost = subLaborCost(row, site, client, otAfter8);
                        const laborOpen = openLaborIds.includes(row.id);
                        return (
                          <SubLaborRow
                            key={row.id}
                            row={row}
                            hours={hours}
                            cost={cost}
                            site={site}
                            client={client}
                            open={laborOpen}
                            onToggle={() =>
                              setOpenLaborIds((current) =>
                                current.includes(row.id)
                                  ? current.filter((id) => id !== row.id)
                                  : [...current, row.id],
                              )
                            }
                            onChange={(next) => patchLabor(index, next)}
                            onPatchRange={(rangeId, patch) => patchLaborRange(row.id, rangeId, patch)}
                            onAddRange={(range) => patchLabor(index, { ...row, ranges: [...row.ranges, range] })}
                            onRemoveRange={(rangeId) =>
                              patchLabor(index, { ...row, ranges: row.ranges.filter((range) => range.id !== rangeId) })
                            }
                            onRemove={() =>
                              void confirmRemove(row.position || "this position", {
                                title: "Remove this position?",
                                confirmLabel: "Remove",
                              }).then((ok) => {
                                if (!ok) return;
                                onChange({ ...card, labor: card.labor.filter((item) => item.id !== row.id) });
                                setOpenLaborIds((current) => current.filter((id) => id !== row.id));
                              })
                            }
                          />
                        );
                      })
                    )}
                  </tbody>
                </table>
              </GripToPan>
            </div>
          ) : null}

          {cardShowsEquipment(card.kind) ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl font-semibold text-[#163038]">Equipment</h3>
                  <p className="text-xs text-[#5b6f73]">
                    Typed rows. Cost is rate × qty, plus freight. Optional start/end multiplies by
                    the date span (daily / weekly / monthly). Stays on Subcontractor.
                  </p>
                </div>
                <button type="button" onClick={addEquip} className={ADD_BTN}>
                  + Add equipment
                </button>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                    <tr>
                      {EQUIP_HEADERS.map((header) => (
                        <th key={header || "actions"} className="px-2 py-2">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {card.equipment.length === 0 ? (
                      <tr className="border-t border-[#d5e0de]">
                        <td colSpan={9} className="px-2 py-4 text-sm text-[#5b6f73]">
                          No equipment rows. Add equipment and type the description.
                        </td>
                      </tr>
                    ) : (
                      card.equipment.map((line, index) => (
                        <tr key={line.id} className="border-t border-[#d5e0de]">
                          <td className="px-2 py-2">
                            <input
                              className="paper-field min-w-[14rem]"
                              value={line.description}
                              onChange={(event) => patchEquip(index, { ...line, description: event.target.value })}
                              aria-label="Equipment description"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <select
                              className="paper-field"
                              value={line.period}
                              onChange={(event) =>
                                patchEquip(index, { ...line, period: event.target.value as SubEquipPeriod })
                              }
                              aria-label="Period"
                            >
                              {SUB_EQUIP_PERIODS.map((period) => (
                                <option key={period} value={period}>
                                  {SUB_EQUIP_PERIOD_LABEL[period]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min={0}
                              className="paper-field w-24"
                              value={line.rate || ""}
                              onChange={(event) => patchEquip(index, { ...line, rate: Number(event.target.value) || 0 })}
                              aria-label="Equipment rate"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min={0}
                              className="paper-field w-20"
                              value={line.qty}
                              onChange={(event) => patchEquip(index, { ...line, qty: Number(event.target.value) || 0 })}
                              aria-label="Equipment qty"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="date"
                              className="paper-field w-36"
                              value={line.start ?? ""}
                              onChange={(event) => patchEquip(index, { ...line, start: event.target.value })}
                              aria-label="Equipment start"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="date"
                              className="paper-field w-36"
                              value={line.end ?? ""}
                              onChange={(event) => patchEquip(index, { ...line, end: event.target.value })}
                              aria-label="Equipment end"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min={0}
                              className="paper-field w-24"
                              value={line.freight || ""}
                              onChange={(event) =>
                                patchEquip(index, { ...line, freight: Number(event.target.value) || 0 })
                              }
                              aria-label="Freight"
                            />
                          </td>
                          <td className="hud-readout px-2 py-2 font-semibold">{money(subEquipAmount(line))}</td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              className="trash-btn"
                              title="Remove equipment"
                              aria-label="Remove equipment"
                              onClick={() =>
                                void confirmRemove(line.description || "this equipment", {
                                  title: "Remove this equipment?",
                                  confirmLabel: "Remove",
                                }).then((ok) => {
                                  if (ok) {
                                    onChange({
                                      ...card,
                                      equipment: card.equipment.filter((item) => item.id !== line.id),
                                    });
                                  }
                                })
                              }
                            >
                              ⌫
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SubLaborRow({
  row,
  hours,
  cost,
  site,
  client,
  open,
  onToggle,
  onChange,
  onPatchRange,
  onAddRange,
  onRemoveRange,
  onRemove,
}: {
  row: SubLaborPosition;
  hours: { st: number; ot: number; dt: number; hours: number };
  cost: number;
  site: string;
  client: string;
  open: boolean;
  onToggle: () => void;
  onChange: (next: SubLaborPosition) => void;
  onPatchRange: (rangeId: string, patch: Partial<CalendarRange>) => void;
  onAddRange: (range: CalendarRange) => void;
  onRemoveRange: (rangeId: string) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <tr className="border-t border-[#d5e0de] align-top">
        <td className="px-2 py-2">
          <div className="flex items-center gap-2">
            <Chevron open={open} onToggle={onToggle} />
            <input
              className="paper-field min-w-[12rem]"
              value={row.position}
              onChange={(event) => onChange({ ...row, position: event.target.value })}
              aria-label="Position title"
              placeholder="Type position"
            />
          </div>
        </td>
        <td className="px-2 py-2">
          <input
            type="number"
            min={0}
            className="paper-field w-24"
            value={row.stRate || ""}
            onChange={(event) => onChange({ ...row, stRate: Number(event.target.value) || 0 })}
            aria-label="ST rate"
          />
        </td>
        <td className="px-2 py-2">
          <input
            type="number"
            min={0}
            className="paper-field w-24"
            value={row.otRate || ""}
            onChange={(event) => onChange({ ...row, otRate: Number(event.target.value) || 0 })}
            aria-label="OT rate"
          />
        </td>
        <td className="px-2 py-2">
          <input
            type="number"
            min={0}
            className="paper-field w-24"
            value={row.dtRate || ""}
            onChange={(event) => onChange({ ...row, dtRate: Number(event.target.value) || 0 })}
            aria-label="DT rate"
          />
        </td>
        <td className="hud-readout px-2 py-2">{hours.st.toLocaleString()}</td>
        <td className="hud-readout px-2 py-2">{hours.ot.toLocaleString()}</td>
        <td className="hud-readout px-2 py-2">{hours.dt.toLocaleString()}</td>
        <td className="hud-readout px-2 py-2">{hours.hours.toLocaleString()}</td>
        <td className="hud-readout px-2 py-2 font-semibold">{money(cost)}</td>
        <td className="px-2 py-2">
          <button type="button" onClick={onRemove} title="Remove position" aria-label="Remove position" className="trash-btn">
            ⌫
          </button>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={10} className="bg-[#f4f1e8] px-4 py-4">
            <CrewPhaseCards
              row={subLaborAsCraftRow(row)}
              site={site}
              client={client}
              onPatchRange={onPatchRange}
              onAddRange={onAddRange}
              onRemoveRange={onRemoveRange}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}
