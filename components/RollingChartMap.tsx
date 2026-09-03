"use client";

import { useMemo, useRef, useState } from "react";
import { FieldBlock } from "@/components/FieldMark";
import {
  CIRCUIT_HINT,
  HOLE_KINDS,
  ROLL_STEPS,
  ROLLING_SHEETS,
  SIDE_WALL_HINT,
  SIDE_WALLS,
  TUBE_HINT,
  TUBE_OD_CHOICES,
  WALL_BAND_HINTS,
  WALL_BAND_LABEL,
  applyRollSteps,
  axisLabel,
  canMarkRepair,
  chartSetupReady,
  defaultHoleId,
  drumMode,
  drumTubeKey,
  drumsFromMode,
  emptyRollingChart,
  emptyRollingTube,
  effectiveDrumHoleId,
  formatIdealTubeId,
  hydrateRollingChart,
  jobTubeOd,
  lastMarkedStep,
  liveCircuitCount,
  liveSideCount,
  liveTubesPerCircuit,
  parseTubeKey,
  readRollingTube,
  rollingProgression,
  sideWallTubeKey,
  stepCount,
  tubeCellMark,
  wallReductionBandForTube,
  wallReductionForTube,
  wallReductionVsIdealForTube,
  type HoleKind,
  type RollStepId,
  type RollingChartState,
  type RollingSheetId,
  type RollingTube,
  type SideWall,
  type SideWallMode,
  type TubeOdChoice,
  type WallBand,
} from "@/lib/rolling-chart";

const STEP_COLORS: Record<RollStepId, string> = {
  "stub-removed": "#083943",
  "hole-cleaned": "#0f5f6d",
  "hole-marked": "#1a7a88",
  "hole-repaired": "#c9a227",
  "tube-installed": "#e38b2a",
  "final-roll": "#163038",
};

const BAND_COLORS: Record<WallBand, string> = {
  under: "#c9a227",
  "low-ok": "#7a8a2a",
  target: "#1f7a3a",
  over: "#b74120",
};

function tubeStyle(state: RollingChartState, tube: RollingTube, selected: boolean): React.CSSProperties {
  const band = wallReductionBandForTube(tube, state);
  const last = lastMarkedStep(tube);
  const fill = tube.holeKind
    ? "#d8d0c0"
    : band
      ? BAND_COLORS[band]
      : last
        ? STEP_COLORS[last]
        : "#fbf8f0";
  const color = tube.holeKind ? "#163038" : band || last ? "#fff" : "#163038";
  return {
    background: fill,
    color,
    outline: selected ? "3px solid #e38b2a" : "2px solid #163038",
    outlineOffset: selected ? "1px" : "0",
  };
}

function asSideMode(value: string): SideWallMode {
  if (value === "none" || value === "left" || value === "right" || value === "both") return value;
  return "both";
}

export function RollingChartMap({
  state: incoming = emptyRollingChart(),
  onChange,
}: {
  state?: RollingChartState;
  onChange: (next: RollingChartState) => void;
}) {
  const state = hydrateRollingChart(incoming);
  const [sheet, setSheet] = useState<RollingSheetId>("steam");
  const [picked, setPicked] = useState<string | null>(null);
  const [circuitPage, setCircuitPage] = useState(1);
  const [jump, setJump] = useState("");
  const [zoom, setZoom] = useState(1.2);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const circuits = liveCircuitCount(state);
  const tubes = liveTubesPerCircuit(state);
  const ready = chartSetupReady(state);
  const current = ROLLING_SHEETS.find((item) => item.id === sheet) ?? ROLLING_SHEETS[0];
  const pickedTube = picked ? readRollingTube(state, picked) : emptyRollingTube();
  const pickedMeta = picked ? parseTubeKey(picked) : null;
  const progression = useMemo(() => rollingProgression(state), [state]);
  const page = Math.min(Math.max(1, circuitPage), Math.max(1, circuits));
  const cellPx = Math.max(40, Math.round(48 * zoom));
  const bankLabel = state.bankName.trim() || "Generating bank";

  function write(next: RollingChartState) {
    onChange(hydrateRollingChart(next));
  }

  function patchInputs(partial: Partial<RollingChartState>) {
    write({ ...state, ...partial, tubes: state.tubes });
  }

  function patchTube(key: string, next: Partial<RollingTube>) {
    const currentTube = readRollingTube(state, key);
    const merged: RollingTube = {
      steps: { ...currentTube.steps, ...next.steps },
      actualTubeId: next.actualTubeId !== undefined ? next.actualTubeId : currentTube.actualTubeId,
      drumHoleId: next.drumHoleId !== undefined ? next.drumHoleId : currentTube.drumHoleId,
      holeKind: next.holeKind !== undefined ? next.holeKind : currentTube.holeKind,
    };
    const tubesMap = { ...state.tubes };
    if (!stepCount(merged) && !merged.actualTubeId.trim() && !merged.drumHoleId.trim() && !merged.holeKind) {
      delete tubesMap[key];
    } else tubesMap[key] = merged;
    write({ ...state, tubes: tubesMap });
  }

  function toggleStep(key: string, id: RollStepId, on: boolean) {
    const currentTube = readRollingTube(state, key);
    if (id === "hole-repaired" && on && !canMarkRepair(currentTube)) return;
    patchTube(key, { steps: applyRollSteps(currentTube.steps, id, on) });
  }

  function goCircuit(next: number) {
    const clamped = Math.min(circuits, Math.max(1, next));
    setCircuitPage(clamped);
    setJump(String(clamped));
    requestAnimationFrame(() => {
      mapRef.current?.querySelector(`#rolling-circuit-${clamped}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  const wr = picked ? wallReductionForTube(pickedTube, state) : null;
  const wall = wr == null ? "" : String(wr);
  const vsIdeal = picked ? wallReductionVsIdealForTube(pickedTube, state) : null;
  const band = picked ? wallReductionBandForTube(pickedTube, state) : null;
  const qaOpen = Boolean(pickedTube.steps["final-roll"]);
  const holeMeasured = Boolean(pickedTube.steps["hole-cleaned"] || pickedTube.steps["hole-repaired"] || pickedTube.drumHoleId.trim());
  const idealId = picked ? formatIdealTubeId(pickedTube, state) : "";
  const drumHole = picked ? effectiveDrumHoleId(pickedTube, state) : "";

  return (
    <div className="plant-card mt-6 px-4 py-4">
      <h2 className="font-display text-xl text-[#163038]">Rolling chart — {bankLabel}</h2>
      <p className="mt-2 text-base text-[#163038]">
        Generating-bank tool for <span className="font-semibold">{bankLabel}</span>. A row is a generating-bank circuit.
        Tube numbers run along the drum. Steam and mud are two joints on the same tube ID. Side walls are their own one-row maps.
      </p>

      <section className="mt-4 rounded-sm border border-[#c5d4d4] bg-[#fbf8f0] px-3 py-3">
        <h3 className="font-display text-lg text-[#163038]">Setup — {bankLabel}</h3>
        <p className="mt-1 text-base text-[#163038]">Required before the map is useful. Persist with the chart.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FieldBlock label="Bank name">
            <input className="paper-field mt-1" value={state.bankName} onChange={(event) => patchInputs({ bankName: event.target.value })} />
          </FieldBlock>
          <FieldBlock label="Circuits">
            <input
              className="paper-field mt-1"
              inputMode="numeric"
              placeholder={`example ${CIRCUIT_HINT} · package 8–20 · power 16–36`}
              value={state.circuits}
              onChange={(event) => patchInputs({ circuits: event.target.value })}
            />
          </FieldBlock>
          <FieldBlock label="Tubes per circuit">
            <input
              className="paper-field mt-1"
              inputMode="numeric"
              placeholder={`example ${TUBE_HINT}`}
              value={state.tubesPerCircuit}
              onChange={(event) => patchInputs({ tubesPerCircuit: event.target.value })}
            />
          </FieldBlock>
          <FieldBlock label="Drums">
            <select
              className="paper-field mt-1"
              value={drumMode(state)}
              onChange={(event) => patchInputs(drumsFromMode(event.target.value))}
            >
              <option value="both">Both</option>
              <option value="steam">Steam</option>
              <option value="mud">Mud</option>
            </select>
          </FieldBlock>
          <FieldBlock label="Side walls">
            <select
              className="paper-field mt-1"
              value={state.sideWalls}
              onChange={(event) => patchInputs({ sideWalls: asSideMode(event.target.value) })}
            >
              <option value="both">Both</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="none">None</option>
            </select>
          </FieldBlock>
          <FieldBlock label="Left tube count">
            <input
              className="paper-field mt-1"
              inputMode="numeric"
              placeholder={`example ${SIDE_WALL_HINT} — 0 hides`}
              value={state.leftTubeCount}
              onChange={(event) => patchInputs({ leftTubeCount: event.target.value })}
            />
          </FieldBlock>
          <FieldBlock label="Right tube count">
            <input
              className="paper-field mt-1"
              inputMode="numeric"
              placeholder={`example ${SIDE_WALL_HINT} — 0 hides`}
              value={state.rightTubeCount}
              onChange={(event) => patchInputs({ rightTubeCount: event.target.value })}
            />
          </FieldBlock>
          <FieldBlock label="Tube OD">
            <select
              className="paper-field mt-1"
              value={state.tubeOd}
              onChange={(event) => patchInputs({ tubeOd: event.target.value as TubeOdChoice })}
            >
              <option value="">Blank</option>
              {TUBE_OD_CHOICES.map((od) => (
                <option key={od} value={od}>
                  {od}
                </option>
              ))}
            </select>
          </FieldBlock>
          <FieldBlock label="Wall (BWG or inches)">
            <input className="paper-field mt-1" value={state.tubeWall} onChange={(event) => patchInputs({ tubeWall: event.target.value })} />
          </FieldBlock>
          <FieldBlock label="Average Tube ID">
            <input className="paper-field mt-1" value={state.averageTubeId} onChange={(event) => patchInputs({ averageTubeId: event.target.value })} />
          </FieldBlock>
          <FieldBlock label="Average Tube OD">
            <input className="paper-field mt-1" value={state.averageTubeOd} onChange={(event) => patchInputs({ averageTubeOd: event.target.value })} />
          </FieldBlock>
          <FieldBlock label="Target WR %">
            <input
              className="paper-field mt-1"
              placeholder={WALL_BAND_HINTS.ideal}
              value={state.idealPercentageRoll}
              onChange={(event) => patchInputs({ idealPercentageRoll: event.target.value })}
            />
          </FieldBlock>
          <FieldBlock label="Wall-reduction low">
            <input className="paper-field mt-1" placeholder={WALL_BAND_HINTS.low} value={state.wallBandLow} onChange={(event) => patchInputs({ wallBandLow: event.target.value })} />
          </FieldBlock>
          <FieldBlock label="Wall-reduction ideal">
            <input className="paper-field mt-1" placeholder={WALL_BAND_HINTS.ideal} value={state.wallBandIdeal} onChange={(event) => patchInputs({ wallBandIdeal: event.target.value })} />
          </FieldBlock>
          <FieldBlock label="Wall-reduction high">
            <input className="paper-field mt-1" placeholder={WALL_BAND_HINTS.high} value={state.wallBandHigh} onChange={(event) => patchInputs({ wallBandHigh: event.target.value })} />
          </FieldBlock>
          <FieldBlock label="Tube 1 at">
            <input className="paper-field mt-1" value={state.tube1At} onChange={(event) => patchInputs({ tube1At: event.target.value })} />
          </FieldBlock>
          <FieldBlock label="Furnace side">
            <input className="paper-field mt-1" value={state.furnaceSide} onChange={(event) => patchInputs({ furnaceSide: event.target.value })} />
          </FieldBlock>
          <FieldBlock label="Manway">
            <input className="paper-field mt-1" value={state.manway} onChange={(event) => patchInputs({ manway: event.target.value })} />
          </FieldBlock>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        {ROLLING_SHEETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setSheet(item.id);
              setPicked(null);
            }}
            className={`rounded-sm px-3 py-1.5 text-sm ${
              sheet === item.id ? "bg-steel text-white" : "border border-steel text-steel"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-base font-semibold text-[#163038]">{current.title}</p>
      {current.tracking !== current.title ? <p className="text-base text-[#163038]">{current.tracking}</p> : null}

      <ol className="sticky top-0 z-10 mt-3 grid gap-2 bg-[#fbf8f0] py-2 sm:grid-cols-2">
        {ROLL_STEPS.map((step) => (
          <li key={step.id} className="flex items-center gap-2 text-sm text-[#163038]">
            <span
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[#163038] text-xs font-bold text-white"
              style={{ background: STEP_COLORS[step.id] }}
            >
              {step.mark}
            </span>
            {step.label}
          </li>
        ))}
        <li className="flex items-center gap-2 text-sm text-[#163038]">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[#163038] bg-[#c9a227] text-xs font-bold text-white">U</span>
          UNDER — re-roll (Actual ID only)
        </li>
        <li className="flex items-center gap-2 text-sm text-[#163038]">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[#163038] bg-[#7a8a2a] text-xs font-bold text-white">L</span>
          Low-ok 10–12% (Actual ID only)
        </li>
        <li className="flex items-center gap-2 text-sm text-[#163038]">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[#163038] bg-[#1f7a3a] text-xs font-bold text-white">T</span>
          Target 12–14% (Actual ID only)
        </li>
        <li className="flex items-center gap-2 text-sm text-[#163038]">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[#163038] bg-[#b74120] text-xs font-bold text-white">O</span>
          OVER — inspect, do not auto-scrap
        </li>
      </ol>

      {!ready && (sheet === "steam" || sheet === "mud" || sheet === "sidewalls") ? (
        <p className="mt-4 text-sm font-semibold text-[#163038]">
          Set circuits and tubes per circuit — or a side-wall count — before the map can draw this bank.
        </p>
      ) : null}

      {ready && (sheet === "steam" || sheet === "mud") ? (
        (sheet === "steam" ? state.steamDrum : state.mudDrum) ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-sm border border-steel px-3 py-2 text-sm text-steel"
                disabled={page <= 1}
                onClick={() => goCircuit(page - 1)}
              >
                Previous circuit
              </button>
              <p className="text-sm font-semibold text-[#163038]">
                Circuit {page} of {circuits || "—"}
              </p>
              <button
                type="button"
                className="rounded-sm border border-steel px-3 py-2 text-sm text-steel"
                disabled={page >= circuits}
                onClick={() => goCircuit(page + 1)}
              >
                Next circuit
              </button>
              <label className="flex items-center gap-2 text-sm text-[#163038]">
                Jump to circuit
                <input
                  className="paper-field w-20"
                  inputMode="numeric"
                  value={jump}
                  onChange={(event) => setJump(event.target.value)}
                  onBlur={() => {
                    const next = Number(jump);
                    if (Number.isInteger(next)) goCircuit(next);
                  }}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-[#163038]">
                Zoom
                <input
                  type="range"
                  min="0.8"
                  max="1.6"
                  step="0.1"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                />
              </label>
            </div>
            <p className="mt-2 text-sm text-[#163038]">
              One row is one generating-bank circuit. Tube numbers run along the drum. Every fifth
              circuit and tube is labeled. Selected stays labeled. Steam and mud are two joints on
              the same tube ID.
            </p>
            <div ref={mapRef} className="mt-2 max-h-[min(70vh,36rem)] overflow-auto">
              <div style={{ minWidth: 44 + tubes * (cellPx + 4) }}>
                <div className="sticky top-0 z-[1] flex items-end gap-1 bg-[#fbf8f0] pb-1">
                  <span className="sticky left-0 z-[2] w-10 shrink-0 bg-[#fbf8f0] text-xs font-bold text-[#163038]">C#</span>
                  {Array.from({ length: tubes }, (_, index) => {
                    const tube = index + 1;
                    return (
                      <span
                        key={`axis-${tube}`}
                        className="text-center text-xs font-bold text-[#163038]"
                        style={{ width: cellPx, minWidth: cellPx }}
                      >
                        {axisLabel(tube, pickedMeta?.tube === tube)}
                      </span>
                    );
                  })}
                </div>
                <div
                  id={`rolling-circuit-${page}`}
                  className="flex flex-nowrap items-center gap-1 bg-[#efe6d4] py-0.5"
                >
                  <span className="sticky left-0 z-[1] w-10 shrink-0 bg-[#fbf8f0] text-sm font-bold text-[#163038]">
                    {axisLabel(page, true || pickedMeta?.circuit === page)}
                  </span>
                  {Array.from({ length: tubes }, (_, tubeIndex) => {
                    const tube = tubeIndex + 1;
                    const key = drumTubeKey(sheet, page, tube);
                    const mark = readRollingTube(state, key);
                    const selected = picked === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        title={`Circuit ${page} tube ${tube}`}
                        aria-label={`Circuit ${page} tube ${tube}`}
                        onClick={() => {
                          setPicked(key);
                          setCircuitPage(page);
                        }}
                        className="tube-cell"
                        style={{
                          ...tubeStyle(state, mark, selected),
                          width: cellPx,
                          minWidth: cellPx,
                          minHeight: cellPx,
                          flexShrink: 0,
                        }}
                      >
                        {tubeCellMark(state, mark) ||
                          axisLabel(tube, selected || pickedMeta?.tube === tube || tube % 5 === 0)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm font-semibold text-[#163038]">This drum is off in setup.</p>
        )
      ) : null}

      {ready && sheet === "sidewalls" ? (
        state.sideWalls === "none" ? (
          <p className="mt-4 text-sm font-semibold text-[#163038]">Side walls are off in setup.</p>
        ) : (
          <div className="mt-4 space-y-6">
            <p className="text-sm text-[#163038]">Side walls are separate one-row maps. They are not extra bank circuits.</p>
            {SIDE_WALLS.map((side) => {
              const count = liveSideCount(state, side);
              if (!count) return null;
              return (
                <div key={side} className="rounded-sm border-2 border-[#163038] bg-[#f4efe3] px-3 py-3">
                  <p className="text-sm font-semibold text-[#163038]">{side === "LEFT" ? "Left side wall" : "Right side wall"}</p>
                  <div className="mt-2 overflow-x-auto">
                    <div className="flex items-end gap-1">
                      {Array.from({ length: count }, (_, index) => {
                        const tube = index + 1;
                        const key = sideWallTubeKey(side as SideWall, tube);
                        return (
                          <span
                            key={`side-axis-${side}-${tube}`}
                            className="text-center text-xs font-bold text-[#163038]"
                            style={{ width: cellPx, minWidth: cellPx }}
                          >
                            {axisLabel(tube, picked === key)}
                          </span>
                        );
                      })}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Array.from({ length: count }, (_, index) => {
                        const tube = index + 1;
                        const key = sideWallTubeKey(side as SideWall, tube);
                        const mark = readRollingTube(state, key);
                        const selected = picked === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            title={`${side} tube ${tube}`}
                            aria-label={`${side} tube ${tube}`}
                            onClick={() => setPicked(key)}
                            className="tube-cell"
                            style={{
                              ...tubeStyle(state, mark, selected),
                              width: cellPx,
                              minWidth: cellPx,
                              minHeight: cellPx,
                              flexShrink: 0,
                            }}
                          >
                            {tubeCellMark(state, mark) || (selected || tube % 5 === 0 ? String(tube) : "")}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : null}

      {sheet === "productivity" ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-[#163038]">Step counts and percent complete from Yes marks. Skip / plug / dummy holes stay out of the total. No invented hours.</p>
          {progression.map((row) => (
            <div key={row.sheet}>
              <p className="text-sm font-semibold text-[#163038]">
                {row.sheet === "steam" ? "Steam drum" : row.sheet === "mud" ? "Mud drum" : "Side walls"} · {row.total} tubes
              </p>
              <div className="mt-2 grid gap-2">
                {ROLL_STEPS.map((step) => {
                  const count = row.steps[step.id];
                  const pct = row.total ? Math.round((count / row.total) * 1000) / 10 : 0;
                  return (
                    <div key={step.id}>
                      <div className="flex justify-between text-sm text-[#163038]">
                        <span>{step.label}</span>
                        <span>
                          {count} / {row.total} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1 h-3 overflow-hidden rounded-sm border border-[#163038] bg-[#fbf8f0]">
                        <div className="h-full bg-steel" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {picked && sheet !== "productivity" ? (
        <div className="mt-4 rounded-sm border border-[#163038] bg-[#fbf8f0] px-3 py-3">
          <p className="text-sm font-semibold text-[#163038]">
            {pickedMeta?.sheet === "sidewalls"
              ? `${pickedMeta.side === "LEFT" ? "Left" : "Right"} side wall · tube ${pickedMeta.tube}`
              : `${pickedMeta?.sheet === "steam" ? "Steam" : "Mud"} drum · circuit ${pickedMeta?.circuit} · tube ${pickedMeta?.tube}`}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ROLL_STEPS.map((step) => {
              const repairLocked = step.id === "hole-repaired" && !canMarkRepair(pickedTube);
              return (
                <label key={step.id} className="flex items-center justify-between gap-2 text-sm text-[#163038]">
                  <span>
                    {step.mark} · {step.label}
                  </span>
                  <select
                    className="paper-field w-24"
                    disabled={repairLocked}
                    value={pickedTube.steps[step.id] ? "yes" : "no"}
                    onChange={(event) => toggleStep(picked, step.id, event.target.value === "yes")}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-[#163038]">Productivity Yes/No is the count. Repair stays off until Marked For Repair.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <FieldBlock label="Hole kind">
              <select
                className="paper-field mt-1"
                value={pickedTube.holeKind}
                onChange={(event) => patchTube(picked, { holeKind: event.target.value as HoleKind })}
              >
                {HOLE_KINDS.map((kind) => (
                  <option key={kind || "tube"} value={kind}>
                    {kind || "Tube"}
                  </option>
                ))}
              </select>
            </FieldBlock>
            {holeMeasured ? (
              <FieldBlock label="Drum ID">
                <input
                  className="paper-field mt-1"
                  value={pickedTube.drumHoleId}
                  placeholder={
                    drumHole && drumHole !== pickedTube.drumHoleId.trim()
                      ? `job default ${drumHole}`
                      : jobTubeOd(state)
                        ? `job default ${defaultHoleId(jobTubeOd(state))}`
                        : ""
                  }
                  onChange={(event) => patchTube(picked, { drumHoleId: event.target.value })}
                />
              </FieldBlock>
            ) : (
              <p className="text-sm text-[#163038]">Drum ID sits after Hole Cleaned or Hole Repaired. Old drums vary — a per-hole ID overrides the job default (OD + 1/32).</p>
            )}
            <FieldBlock label="Ideal ID">
              <input className="paper-field mt-1" readOnly value={idealId} placeholder="Empty until Drum ID and tube dims" />
            </FieldBlock>
            {qaOpen ? (
              <>
                <FieldBlock label="Actual Tube ID">
                  <input
                    className="paper-field mt-1"
                    value={pickedTube.actualTubeId}
                    onChange={(event) => patchTube(picked, { actualTubeId: event.target.value })}
                  />
                </FieldBlock>
                <FieldBlock label="Wall reduction %">
                  <input className="paper-field mt-1" readOnly value={wall} placeholder="Empty until Actual Tube ID" />
                </FieldBlock>
                <FieldBlock label="WR vs target">
                  <input
                    className="paper-field mt-1"
                    readOnly
                    value={vsIdeal == null ? "" : String(vsIdeal)}
                    placeholder="Empty until Actual Tube ID"
                  />
                </FieldBlock>
                <FieldBlock label="WR band">
                  <input className="paper-field mt-1" readOnly value={band ? WALL_BAND_LABEL[band] : ""} placeholder="Empty until Actual Tube ID" />
                </FieldBlock>
              </>
            ) : (
              <p className="text-sm text-[#163038]">Drum ID, Ideal ID, Actual ID, and WR% attach to Final Roll. Empty Actual Tube ID stays empty.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
