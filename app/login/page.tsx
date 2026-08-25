"use client";

import { AuthGate } from "@/components/AuthGate";
import { FieldTrialBanner } from "@/components/FieldTrialBanner";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <AuthGate require="anonymous">
      <div className="min-h-screen bg-ink">
        <FieldTrialBanner />
        <div className="login-og">
          {/* Exact original Hit Squad industrial night hero — do not substitute. */}
          <img
            src="/brand-hero.jpg"
            alt="HIT SQUAD ESTIMATORS — ESTIMATE & COST"
            className="login-og-image"
          />
        </div>
        <div className="relative z-10 mx-auto -mt-6 max-w-xl px-4 pb-10 sm:-mt-10">
          <div className="steel-plate paper-grain px-5 py-6 sm:px-7">
            <p className="mb-5 text-center font-mono text-[11px] tracking-[0.28em] text-steel-glow">
              FORGEBOOK · OWNER DESK · PROJECT CONTROLS
            </p>
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
