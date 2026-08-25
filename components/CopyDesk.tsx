"use client";

import { useDisplay } from "@/components/DisplayProvider";

const WORDS = [
  ["This job", "the open outage or T&M package on the blotter"],
  ["People", "craft, supervision, and staff on the job"],
  ["Daily count", "heads and hours for that shift"],
  ["Extra work", "a change-order / SCR"],
  ["Letter to the client", "the printed proposal or RFQ letter — always Day / paper white"],
];

export function CopyDesk() {
  const { prefs, setPrefs } = useDisplay();

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Copy</h2>
        <p className="mt-2 text-sm text-[#5b6f73]">
          Easy Mode short words. Desk opens in standard language. Easy stays off the header.
        </p>
        <dl className="mt-4 space-y-3">
          {WORDS.map(([term, meaning]) => (
            <div key={term}>
              <dt className="font-semibold text-[#163038]">{term}</dt>
              <dd className="text-sm text-[#5b6f73]">{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="plant-card px-5 py-5">
        <button
          type="button"
          role="switch"
          aria-checked={prefs.easyMode}
          onClick={() => setPrefs({ easyMode: !prefs.easyMode })}
          className="flex w-full items-center justify-between rounded-lg border border-[#d5e0de] px-3 py-3 text-left"
        >
          <span>Easy Mode</span>
          <span className={`rounded-full px-3 py-1 text-sm text-white ${prefs.easyMode ? "bg-steel" : "bg-[#5b6f73]"}`}>
            {prefs.easyMode ? "On" : "Off"}
          </span>
        </button>
        <p className="mt-2 text-sm text-[#5b6f73]">
          Off by default. Buried here on purpose. Does not sit on the header.
        </p>
      </section>
    </div>
  );
}
