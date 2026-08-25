"use client";

import { TALK_STEPS } from "@/lib/talk-walk";
import { useSession } from "@/components/SessionProvider";
import { useTalkWalk } from "@/components/TalkWalk";
import { hasBuildDesk } from "@/lib/desk-role";

export function HowWeTalkDesk() {
  const { user } = useSession();
  const { openWalk } = useTalkWalk();
  const owner = hasBuildDesk(user);

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="text-2xl font-semibold text-[#163038]">How we talk</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">
        Briefing, then the walk. Owner and operator skip the demo. Testers see it on first sign-in.
        Returning testers get Walkthrough updated. Replay lives in Settings → How we talk.
        {owner ? " You can skip." : ""}
      </p>
      <dl className="mt-4 space-y-3">
        {TALK_STEPS.map((step) => (
          <div key={step.title}>
            <dt className="font-semibold text-[#163038]">{step.title}</dt>
            <dd className="text-sm text-[#5b6f73]">{step.body}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={openWalk} className="rounded-lg bg-steel px-4 py-2 text-white">
          Replay
        </button>
        {owner ? <p className="self-center text-sm text-[#5b6f73]">Owner and operator can skip.</p> : null}
      </div>
    </section>
  );
}
