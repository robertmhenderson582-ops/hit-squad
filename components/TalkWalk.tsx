"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  readTalkWalk,
  talkStepsForDesk,
  TALK_WALK_VERSION,
  writeTalkWalk,
} from "@/lib/talk-walk";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { NOVUS_HELP_EMAIL } from "@/lib/desk-help";
import { canDesignerShip } from "@/lib/desk-role";

type TalkMode = "closed" | "briefing" | "walk" | "updated";

type TalkWalkApi = {
  openWalk: () => void;
};

const TalkWalkContext = createContext<TalkWalkApi>({ openWalk: () => undefined });

export function TalkWalkProvider({ children }: { children: React.ReactNode }) {
  const { user, status } = useSession();
  const desk = useOwnerDesk();
  const steps = talkStepsForDesk(desk?.showInboxSuggestionBox);
  const [mode, setMode] = useState<TalkMode>("closed");
  const [step, setStep] = useState(0);

  const finish = useCallback((skipped: boolean) => {
    writeTalkWalk({ version: TALK_WALK_VERSION, skipped });
    setMode("closed");
    setStep(0);
  }, []);

  const openWalk = useCallback(() => {
    setStep(0);
    setMode("walk");
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    if (user.mustChangePassword) return;
    if (canDesignerShip(user)) {
      const seen = readTalkWalk();
      if (!seen) writeTalkWalk({ version: TALK_WALK_VERSION, skipped: true });
      return;
    }
    const seen = readTalkWalk();
    if (!seen) {
      setMode("briefing");
      return;
    }
    if (seen.version < TALK_WALK_VERSION) setMode("updated");
  }, [status, user]);

  const value = useMemo(() => ({ openWalk }), [openWalk]);

  return (
    <TalkWalkContext.Provider value={value}>
      {children}
      {mode === "briefing" ? (
        <div className="talk-scrim">
          <section className="talk-card">
            <p className="text-xs tracking-[0.16em] text-[#5b6f73]">HOW WE TALK</p>
            <h2 className="mt-2 font-display text-2xl text-[#163038]">Briefing</h2>
            <p className="mt-3 text-sm leading-6 text-[#163038]">
              {desk?.showInboxSuggestionBox
                ? "Email is out. Messages, tickets, and screenshots stay in Inbox and Tickets. This short walk shows the Inbox FAB, Enter to send, and the Ticket beacon."
                : `Inbox and Suggestion Box are off this desk for now. For tickets and help, email ${NOVUS_HELP_EMAIL}. Use regular email to communicate.`}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => finish(true)} className="rounded-lg border border-steel px-4 py-2 text-steel">
                Skip
              </button>
              <button type="button" onClick={() => setMode("walk")} className="rounded-lg bg-steel px-4 py-2 text-white">
                Walk through it
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {mode === "updated" ? (
        <div className="talk-scrim">
          <section className="talk-card">
            <h2 className="font-display text-2xl text-[#163038]">Walkthrough updated</h2>
            <p className="mt-2 text-sm text-[#5b6f73]">How we talk has a short new briefing.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => setMode("walk")} className="rounded-lg bg-steel px-4 py-2 text-white">
                Walk through it
              </button>
              <button type="button" onClick={() => finish(true)} className="rounded-lg border border-steel px-4 py-2 text-steel">
                Not now
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {mode === "walk" ? (
        <div className="talk-scrim">
          <section className="talk-card">
            <p className="text-xs tracking-[0.16em] text-[#5b6f73]">HOW WE TALK</p>
            <h2 className="mt-2 font-display text-2xl text-[#163038]">{steps[Math.min(step, steps.length - 1)].title}</h2>
            <p className="mt-3 text-sm leading-6 text-[#163038]">{steps[Math.min(step, steps.length - 1)].body}</p>
            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <button type="button" onClick={() => finish(true)} className="text-sm text-steel underline">
                Skip
              </button>
              <div className="flex gap-2">
                {step > 0 ? (
                  <button type="button" onClick={() => setStep((n) => n - 1)} className="rounded-lg border border-steel px-4 py-2 text-steel">
                    Back
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (step + 1 >= steps.length) finish(false);
                    else setStep((n) => n + 1);
                  }}
                  className="rounded-lg bg-steel px-4 py-2 text-white"
                >
                  {step + 1 >= steps.length ? "Done" : "Next"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </TalkWalkContext.Provider>
  );
}

export function useTalkWalk() {
  return useContext(TalkWalkContext);
}
