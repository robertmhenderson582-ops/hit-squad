"use client";

const WORDS = [
  ["This job", "the open outage or T&M package on the blotter"],
  ["People", "craft, supervision, and staff on the job"],
  ["Daily count", "heads and hours for that shift"],
  ["Extra work", "a change-order / SCR"],
  ["Letter to the client", "the printed proposal or RFQ letter — always Day / paper white"],
];

export function CopyDesk() {
  return (
    <section className="plant-card px-5 py-5">
      <h2 className="text-2xl font-semibold text-[#163038]">Copy</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">
        Easy Mode short words. Desk opens in standard language; Easy is off the header.
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
  );
}
