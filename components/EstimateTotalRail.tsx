"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { useSession } from "@/components/SessionProvider";
import { readFcrPacket } from "@/lib/change-order-packet";
import { readEquipmentSheet } from "@/lib/equipment-sheet";
import { deskPackageBreakdown, fcrChangeOrderTotal } from "@/lib/estimate-desk-total";
import {
  ESTIMATE_TOTAL_RAIL_PHONE_QUERY,
  clampEstimateTotalRailPosition,
  clearEstimateTotalRailPosition,
  readEstimateTotalRailPhoneHidden,
  readEstimateTotalRailPosition,
  writeEstimateTotalRailPhoneHidden,
  writeEstimateTotalRailPosition,
  type EstimateTotalRailPosition,
} from "@/lib/estimate-total-rail";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import { readOtherCost, syncOtherCostTravel } from "@/lib/other-cost";
import { onEstimateSheets } from "@/lib/sheet-events";
import { readSubSheet } from "@/lib/subcontractor";

function money(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function railStyle(pos: EstimateTotalRailPosition | null): CSSProperties | undefined {
  if (!pos) return undefined;
  return { left: pos.left, top: pos.top, right: "auto" };
}

export function EstimateTotalRail({ client = "", site = "" }: { client?: string; site?: string }) {
  const pack = useEstimatePackage();
  const { user, status } = useSession();
  const seat = user?.email ?? "";
  const railRef = useRef<HTMLElement>(null);
  const drag = useRef<{ ox: number; oy: number; sl: number; st: number } | null>(null);
  const posRef = useRef<EstimateTotalRailPosition | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [tick, setTick] = useState(0);
  const [phone, setPhone] = useState(false);
  const [phoneHidden, setPhoneHidden] = useState(false);
  const [pos, setPos] = useState<EstimateTotalRailPosition | null>(null);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    setHost(document.body);
  }, []);

  useEffect(() => onEstimateSheets(() => setTick((n) => n + 1)), []);

  useEffect(() => {
    setPhoneHidden(readEstimateTotalRailPhoneHidden());
    const media = window.matchMedia(ESTIMATE_TOTAL_RAIL_PHONE_QUERY);
    const sync = () => setPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  function clampLive(next: EstimateTotalRailPosition): EstimateTotalRailPosition {
    const el = railRef.current;
    return clampEstimateTotalRailPosition(
      next,
      { width: window.innerWidth, height: window.innerHeight },
      { width: el?.offsetWidth || 268, height: el?.offsetHeight || 200 },
    );
  }

  function applyPos(next: EstimateTotalRailPosition | null, persist = false) {
    posRef.current = next;
    setPos(next);
    if (!persist) return;
    if (next) writeEstimateTotalRailPosition(next, undefined, seat);
    else clearEstimateTotalRailPosition(undefined, seat);
  }

  useEffect(() => {
    if (status === "loading") return;
    const stored = readEstimateTotalRailPosition(undefined, seat);
    if (!stored) return;
    const next = clampLive(stored);
    posRef.current = next;
    setPos(next);
  }, [seat, status]);

  useEffect(() => {
    function onResize() {
      if (!posRef.current) return;
      applyPos(clampLive(posRef.current), true);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [seat]);

  function hideOnPhone() {
    writeEstimateTotalRailPhoneHidden(true);
    setPhoneHidden(true);
  }

  function showOnPhone() {
    writeEstimateTotalRailPhoneHidden(false);
    setPhoneHidden(false);
  }

  function resetPosition() {
    applyPos(null, true);
  }

  function startDrag(clientX: number, clientY: number) {
    const el = railRef.current;
    if (!el || drag.current) return;
    const rect = el.getBoundingClientRect();
    drag.current = { ox: clientX, oy: clientY, sl: rect.left, st: rect.top };
    setDragging(true);

    function move(event: { clientX: number; clientY: number }) {
      if (!drag.current) return;
      applyPos(
        clampLive({
          left: drag.current.sl + event.clientX - drag.current.ox,
          top: drag.current.st + event.clientY - drag.current.oy,
        }),
      );
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (!drag.current) return;
      drag.current = null;
      setDragging(false);
      if (posRef.current) applyPos(posRef.current, true);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest("button")) return;
    event.preventDefault();
    startDrag(event.clientX, event.clientY);
  }

  const crewRows = useMemo(
    () => [
      ...pack.crew.staff,
      ...pack.crew.generalForeman,
      ...pack.crew.foreman,
      ...pack.crew.direct,
      ...pack.crew.support,
    ],
    [pack.crew],
  );
  const hours = useMemo(
    () =>
      sumSplits(
        crewRows.map((row) => computeRowHours(row, site, client, pack.crew.otAfter8, "", pack.jobMeta.holidays ?? [])),
      ),
    [client, crewRows, pack.crew.otAfter8, pack.jobMeta.holidays, site],
  );

  const breakdown = useMemo(() => {
    const equipment = readEquipmentSheet(pack.estimateKey);
    const other = syncOtherCostTravel(readOtherCost(pack.estimateKey), pack.crew, {
      staffPerMile: pack.jobMeta.staffMileageRate,
      craftPerMile: pack.jobMeta.craftMileageRate,
    });
    return deskPackageBreakdown({
      crew: pack.crew,
      site,
      client,
      equipment,
      otherCost: other,
      subcontractor: readSubSheet(pack.estimateKey),
      jobMeta: pack.jobMeta,
      changeOrders: fcrChangeOrderTotal(readFcrPacket(pack.estimateKey)),
      hours: hours.hours,
    });
  }, [
    client,
    hours.hours,
    pack.crew,
    pack.crew.otAfter8,
    pack.estimateKey,
    pack.jobMeta,
    site,
    tick,
  ]);

  const movedClass = pos ? " est-total-rail-moved" : "";
  const dragClass = dragging ? " est-total-rail-dragging" : "";

  const chip = (
    <button
      ref={(el) => {
        railRef.current = el;
      }}
      type="button"
      className={`est-total-rail-chip hud-tile print-hide${movedClass}`}
      style={railStyle(pos)}
      onClick={showOnPhone}
      aria-label="Show estimate total"
      data-testid="estimate-total-rail-chip"
    >
      <span>Estimate total</span>
      <span className="hud-readout">{breakdown.total ? money(breakdown.total) : "—"}</span>
    </button>
  );

  const rail = (
    <aside
      ref={railRef}
      className={`est-total-rail hud-tile print-hide${movedClass}${dragClass}`}
      style={railStyle(pos)}
      aria-label="Estimate total"
      aria-grabbed={dragging}
      title="Drag to move"
      data-testid="estimate-total-rail"
      onPointerDown={onPointerDown}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement | null)?.closest("button")) return;
        event.preventDefault();
        startDrag(event.clientX, event.clientY);
      }}
    >
      <div className="est-total-rail-head">
        <h2>
          <span className="est-total-rail-move" aria-hidden="true">
            Move
          </span>
          Estimate total
        </h2>
        <div className="est-total-rail-actions">
          {pos ? (
            <button type="button" className="est-total-rail-reset" onClick={resetPosition}>
              Reset
            </button>
          ) : null}
          {phone ? (
            <button type="button" className="est-total-rail-hide" onClick={hideOnPhone}>
              Hide
            </button>
          ) : null}
        </div>
      </div>
      <p className="est-total-rail-grand hud-readout">{breakdown.total ? money(breakdown.total) : "—"}</p>
      {breakdown.lines.length ? (
        <ul>
          {breakdown.lines.map((line) => (
            <li key={line.id}>
              <span>{line.label}</span>
              <span className="hud-readout">{money(line.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="est-total-rail-empty">Lines appear when a worksheet has dollars.</p>
      )}
      <p className="est-total-rail-hours">
        Man-hours
        <span className="hud-readout">{breakdown.hours ? breakdown.hours.toLocaleString("en-US") : "—"}</span>
      </p>
    </aside>
  );

  const node = phone && phoneHidden ? chip : rail;
  return host ? createPortal(node, host) : node;
}
