"use client";

import { playInboxChime } from "@/lib/chime";
import type { Density, ThemeChoice, TypeSize } from "@/lib/display";
import { useDisplay } from "@/components/DisplayProvider";

const THEMES: { value: ThemeChoice; title: string; copy: string }[] = [
  { value: "night", title: "Night", copy: "instrument-cluster HUD — hairline frames, teal and amber readouts. Default desk." },
  { value: "day", title: "Day", copy: "paper-white shop-light desk. Prints and RFQ letters always use this." },
  { value: "match", title: "Match device", copy: "follows this computer’s dark/light setting." },
];

export function DisplayDesk() {
  const { prefs, setPrefs } = useDisplay();

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Display</h2>
        <p className="mt-2 text-sm text-[#5b6f73]">
          Night is the instrument-cluster HUD. Day is paper white. The sun/moon button in the header
          (and on the lock screen) flips Day ↔ Night without opening Settings. The choice stays on
          this device. It does not change price math. Printed proposals and RFQ letters always come
          out in Day (paper white), even if the desk is in Night.
        </p>
        <div className="mt-4 space-y-2">
          {THEMES.map((item) => (
            <label key={item.value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d5e0de] px-3 py-3">
              <input
                type="radio"
                name="theme"
                checked={prefs.theme === item.value}
                onChange={() => setPrefs({ theme: item.value })}
                className="mt-1"
              />
              <span>
                <span className="font-semibold">{item.title}</span> — {item.copy}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="plant-card px-5 py-5">
        <h2 className="text-xl font-semibold text-[#163038]">Type and motion</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">
          High contrast and type size still apply on top of Day/Night. Easy Mode lives at the bottom
          of Settings → Copy — not here, not on the header.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            type size
            <select
              value={prefs.typeSize}
              onChange={(event) => setPrefs({ typeSize: event.target.value as TypeSize })}
              className="paper-field mt-1"
            >
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
            </select>
          </label>
          <label className="block text-sm">
            compact/comfortable
            <select
              value={prefs.density}
              onChange={(event) => setPrefs({ density: event.target.value as Density })}
              className="paper-field mt-1"
            >
              <option value="compact">compact</option>
              <option value="comfortable">comfortable</option>
            </select>
          </label>
          <Toggle label="high contrast" on={prefs.highContrast} onChange={(on) => setPrefs({ highContrast: on })} />
          <Toggle label="reduce motion" on={prefs.reduceMotion} onChange={(on) => setPrefs({ reduceMotion: on })} />
          <Toggle label="larger tap targets" on={prefs.largeTargets} onChange={(on) => setPrefs({ largeTargets: on })} />
        </div>
      </section>

      <section className="plant-card px-5 py-5">
        <Toggle
          label="Confirm before delete"
          on={prefs.confirmDelete}
          onChange={(on) => setPrefs({ confirmDelete: on })}
        />
        <p className="mt-2 text-sm text-[#5b6f73]">
          In-app dialog with the name, Cancel, Remove — not a browser prompt. If this is
          off, delete immediately.
        </p>
      </section>

      <section className="plant-card px-5 py-5">
        <Toggle
          label="Inbox sound"
          on={prefs.inboxSound}
          onChange={(on) => {
            setPrefs({ inboxSound: on });
            if (on) playInboxChime();
          }}
        />
        <p className="mt-2 text-sm text-[#5b6f73]">
          New Inbox messages play a short chime, on by default. Toggle off on that device. Flip on
          to hear a preview.
        </p>
      </section>
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between rounded-lg border border-[#d5e0de] px-3 py-3 text-left"
    >
      <span>{label}</span>
      <span className={`rounded-full px-3 py-1 text-sm text-white ${on ? "bg-steel" : "bg-[#5b6f73]"}`}>
        {on ? "On" : "Off"}
      </span>
    </button>
  );
}
