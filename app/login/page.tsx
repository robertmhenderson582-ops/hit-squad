"use client";

import { AuthGate } from "@/components/AuthGate";
import { FieldTrialBanner } from "@/components/FieldTrialBanner";
import { LoginForm } from "@/components/LoginForm";
import { Wordmark } from "@/components/Wordmark";

export default function LoginPage() {
  return (
    <AuthGate require="anonymous">
      <div className="login-hero">
        <FieldTrialBanner />
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-40px)] max-w-6xl flex-col justify-between gap-8 px-4 py-8 lg:flex-row lg:items-center lg:py-12">
          <div className="max-w-xl">
            <Wordmark subline="ESTIMATORS" />
            <p className="mt-5 font-mono text-[11px] tracking-[0.28em] text-steel-glow">
              FORGEBOOK · OWNER DESK · PROJECT CONTROLS
            </p>
            <p className="mt-4 max-w-md text-sm leading-6 text-paper-cream/80">
              Private outage and T&amp;M estimating blotter. Madison / P66 figures stay on this
              desk. Field trial — not a release.
            </p>
          </div>
          <div className="steel-plate paper-grain w-full max-w-xl px-5 py-6 sm:px-7">
            <LoginForm />
            <p className="mt-6 text-center font-mono text-[10px] leading-5 tracking-[0.12em] text-paper-cream/45">
              Invite only. Owner: Robert Henderson. Not a public product.
            </p>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
