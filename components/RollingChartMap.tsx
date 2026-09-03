"use client";

import { useMemo, useState } from "react";
import { FieldBlock } from "@/components/FieldMark";
import {
  CIRCUIT_HINT,
  ROLL_STEPS,
  ROLLING_SHEETS,
  SIDE_WALL_HINT,
  SIDE_WALLS,
  TUBE_HINT,
  WALL_BAND_HINTS,
  chartSetupReady,
  drumTubeKey,
  emptyRollingChart,
  emptyRollingTube,
  formatWallReduction,
  hydrateRollingChart,
  lastMarkedStep,
  liveCircuitCount,
  liveSideCount,
  liveTubesPerCircuit,
  readRollingTube,
  rollingProgression,
  sideWallTubeKey,
  stepCount,
  wallReductionBand,
  type RollStepId,
  type RollingChartState,
  type RollingSheetId,
  type RollingTube,
  type SideWall,
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
  pass: "#1f7a3a",
  over: "#b74120",
};

function tubeStyle(state: RollingChartState, tube: RollingTube, selected: boolean): React.CSSProperties {
  const band = wallReductionBand(
    tube.actualTubeId,
    state.averageTubeId,
    state.averageTubeOd,
    state.wallBandLow,
    state.wallBandHigh,
  );
  const last = lastMarkedStep(tube);
  const fill = band ? BAND_COLORS[band] : last ? STEP_COLORS[last] : "#fbf8f0";
  const color = band || last ? "#fff" : "#163038";
  return {
    background: fill,
    color,
    outline: selected ? "3px solid #e38b2a" : "1px solid #163038",
    outlineOffset: selected ? "1px" : "0",
  };
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
  const circuits = liveCircuitCount(state);
  const tubes = liveTubesPerCircuit(state);
  const ready = chartSetupReady(state);
  const current = ROLLING_SHEETS.find((item) => item.id === sheet) ?? ROLLING_SHEETS[0];
  const pickedTube = picked ? readRollingTube(state, picked) : emptyRollingTube();
  const progression = useMemo(() => rollingProgression(state), [state]);
  const page = Math.min(Math.max(1, circuitPage), Math.max(1, circuits));

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
    };
    const tubesMap = { ...state.tubes };
    if (!stepCount(merged) && !merged.actualTubeId.trim() && !merged.drumHoleId.trim()) delete tubesMap[key];
    else tubesMap[key] = merged;
    write({ ...state, tubes: tubesMap });
  }

  function toggleStep(key: string, id: RollStepId, on: boolean) {
    const currentTube = readRollingTube(state, key);
    patchTube(key, { steps: { ...currentTube.steps, [id]: on } });
  }

  const wall = picked
    ? formatWallReduction(pickedTube.actualTubeId, state.averageTubeId, state.averageTubeOd)
    : "";

  return (
    <div className="plant-card mt-6 px-4 py-4">
      <h2 className="font-display text-xl text-[#163038]">Rolling chart</h2>
      <p className="mt-2 text-sm text-[#163038]">
        Generating-bank tool. Set up this bank first. A row is a generating-bank circuit. Marks stay
        sparse — shrinking a count hides tubes; bumping it back restores them.
      </p>

      <section className="mt-4 rounded-sm border border-[#c5d4d4] bg-[#fbf8f0] px-3 py-3">
        <h3 className="font-display text-lg text-[#163038]">Setup</h3>
        <p className="mt-1 text-sm text-[#163038]">Required before the map is useful. Persist with the chart.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FieldBlock label="Bank name">
            <input className="paper-field mt-1" value={state.bankName} onChange={(event) => patchInputs({ bankName: event.target.value })} />
          </FieldBlock>
          <FieldBlock label="Circuits">
            <input
              className="paper-field mt-1"
              inputMode="numeric"
              placeholder={`example ${CIRCUIT_HINT}`}
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
          <FieldBlock label="Steam drum">
            <select
              className="paper-field mt-1"
              value={state.steamDrum ? "on" : "off"}
              onChange={(event) => patchInputs({ steamDrum: event.target.value === "on" })}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </FieldBlock>
          <FieldBlock label="Mud drum">
            <select
              className="paper-field mt-1"
              value={state.mudDrum ? "on" : "off"}
              onChange={(event) => patchInputs({ mudDrum: event.target.value === "on" })}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </FieldBlock>
          <FieldBlock label="Side walls">
            <select
              className="paper-field mt-1"
              value={state.sideWalls}
              onChange={(event) => patchInputs({ sideWalls: event.target.value === "none" ? "none" : "left-right" })}
            >
              <option value="left-right">Left + right</option>
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
          <FieldBlock label="Ideal % roll">
            <input className="paper-field mt-1" value={state.idealPercentageRoll} onChange={(event) => patchInputs({ idealPercentageRoll: event.target.value })} />
          </FieldBlock>
          <FieldBlock label="Average Tube ID">
            <input className="paper-field mt-1" value={state.averageTubeId} onChange={(event) => patchInputs({ averageTubeId: event.target.value })} />
          </FieldBlock>
          <FieldBlock label="Average Tube OD">
            <input className="paper-field mt-1" value={state.averageTubeOd} onChange={(event) => patchInputs({ averageTubeOd: event.target.value })} />
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
      <p className="mt-2 text-sm font-semibold text-[#163038]">{current.title}</p>
      {current.tracking !== current.title ? <p className="text-sm text-[#163038]">{current.tracking}</p> : null}

      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {ROLL_STEPS.map((step) => (
          <li key={step.id} className="flex items-center gap-2 text-sm text-[#163038]">
            <span className="inline-block h-5 w-5 shrink-0 border border-[#163038]" style={{ background: STEP_COLORS[step.id] }} />
            {step.label}
          </li>
        ))}
        <li className="flex items-center gap-2 text-sm text-[#163038]">
          <span className="inline-block h-5 w-5 shrink-0 border border-[#163038] bg-[#c9a227]" />
          Wall reduction under (Actual ID only)
        </li>
        <li className="flex items-center gap-2 text-sm text-[#163038]">
          <span className="inline-block h-5 w-5 shrink-0 border border-[#163038] bg-[#1f7a3a]" />
          Wall reduction pass (Actual ID only)
        </li>
        <li className="flex items-center gap-2 text-sm text-[#163038]">
          <span className="inline-block h-5 w-5 shrink-0 border border-[#163038] bg-[#b74120]" />
          Wall reduction over (Actual ID only)
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
                onClick={() => setCircuitPage((n) => Math.max(1, n - 1))}
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
                onClick={() => setCircuitPage((n) => Math.min(circuits, n + 1))}
              >
                Next circuit
              </button>
            </div>
            <p className="mt-2 text-sm text-[#163038]">Tubes on this circuit. Tap a cell — large enough for a phone.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.from({ length: tubes }, (_, index) => {
                const tube = index + 1;
                const key = drumTubeKey(sheet, page, tube);
                const mark = readRollingTube(state, key);
                return (
                  <button
                    key={key}
                    type="button"
                    title={`Circuit ${page} tube ${tube}`}
                    aria-label={`Circuit ${page} tube ${tube}`}
                    onClick={() => setPicked(key)}
                    className="tube-cell"
                    style={tubeStyle(state, mark, picked === key)}
                  >
                    {tube}
                  </button>
                );
              })}
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
          <div className="mt-4 space-y-4">
            {SIDE_WALLS.map((side) => {
              const count = liveSideCount(state, side);
              if (!count) return null;
              return (
                <div key={side}>
                  <p className="text-sm font-semibold text-[#163038]">{side === "LEFT" ? "Left" : "Right"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Array.from({ length: count }, (_, index) => {
                      const tube = index + 1;
                      const key = sideWallTubeKey(side as SideWall, tube);
                      const mark = readRollingTube(state, key);
                      return (
                        <button
                          key={key}
                          type="button"
                          title={`${side} tube ${tube}`}
                          aria-label={`${side} tube ${tube}`}
                          onClick={() => setPicked(key)}
                          className="tube-cell"
                          style={tubeStyle(state, mark, picked === key)}
                        >
                          {tube}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : null}

      {sheet === "productivity" ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-[#163038]">Step counts and percent complete from Yes marks. No invented hours.</p>
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
          <p className="text-sm font-semibold text-[#163038]">Tube {picked.replace(/^(steam|mud|sidewalls):/, "")}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ROLL_STEPS.map((step) => (
              <label key={step.id} className="flex items-center gap-2 text-sm text-[#163038]">
                <input
                  type="checkbox"
                  checked={Boolean(pickedTube.steps[step.id])}
                  onChange={(event) => toggleStep(picked, step.id, event.target.checked)}
                />
                {step.label}
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <FieldBlock label="Drum hole ID">
              <input
                className="paper-field mt-1"
                value={pickedTube.drumHoleId}
                onChange={(event) => patchTube(picked, { drumHoleId: event.target.value })}
              />
            </FieldBlock>
            <FieldBlock label="Actual Tube ID">
              <input
                className="paper-field mt-1"
                value={pickedTube.actualTubeId}
                onChange={(event) => patchTube(picked, { actualTubeId: event.target.value })}
              />
            </FieldBlock>
            <FieldBlock label="Wall reduction %">
              <input className="paper-field mt-1" readOnly value={wall} placeholder="Empty until Actual Tube ID and averages" />
            </FieldBlock>
          </div>
        </div>
      ) : null}
    </div>
  );
}
