"use client";

import { useEffect, useState } from "react";
import { useConfirmRemove } from "@/components/ConfirmDialog";
import { useEstimatePackage } from "@/components/EstimatePackage";
import {
  SUB_UNITS,
  SUB_UNIT_LABEL,
  applyBookRate,
  applyTypedAmount,
  blankSubLine,
  blankSubRate,
  bookLabel,
  emptySubBook,
  emptySubSheet,
  lineAmount,
  readSubBook,
  readSubSheet,
  subcontractorTotal,
  writeSubBook,
  writeSubSheet,
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
                      {SUB_UNITS.map((unit) => (
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

export function SubcontractorDesk() {
  const pack = useEstimatePackage();
  const confirmRemove = useConfirmRemove();
  const [sheet, setSheet] = useState<SubSheet>(emptySubSheet);
  const [book, setBook] = useState<SubRate[]>(emptySubBook);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const total = subcontractorTotal(sheet);

  useEffect(() => {
    const next = readSubSheet(pack.estimateKey);
    setSheet(next);
    setOpenIds(next.lines.filter((line) => !line.vendor && !line.scope && !line.rate).map((line) => line.id));
    setBook(readSubBook());
  }, [pack.estimateKey]);

  function persist(next: SubSheet) {
    setSheet(next);
    writeSubSheet(pack.estimateKey, next);
  }

  function patch(index: number, nextLine: SubLine) {
    const next = sheet.lines.slice();
    next[index] = nextLine;
    persist({ lines: next });
  }

  function addRow() {
    const line = blankSubLine();
    persist({ lines: [...sheet.lines, line] });
    setOpenIds((current) => [...current, line.id]);
  }

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Subcontractor. Not Crew labor and not Other Cost misc. Pick a plugged rate or type a
        one-off. Amount is qty × rate. Lump sum is unit LS with qty 1, or type the amount.
      </p>

      <section className="plant-card px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-[#163038]">Subcontractor</h2>
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
                    No subcontractors on this package. Add row, then pick a book rate or type a
                    one-off.
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
                          persist({ lines: sheet.lines.filter((item) => item.id !== line.id) });
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
                  {SUB_UNITS.map((unit) => (
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
