"use client";

import Image from "next/image";
import { AuthGate } from "@/components/AuthGate";
import { FieldTrialBanner } from "@/components/FieldTrialBanner";
import { ClaimInviteForm } from "@/components/ClaimInviteForm";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <AuthGate require="anonymous">
      <div className="min-h-screen bg-ink">
        <FieldTrialBanner />
        <div className="login-og">
          {/* Exact original Hit Squad industrial night hero — do not substitute. */}
          <Image
            src="/brand-hero.jpg"
            alt="HIT SQUAD ESTIMATORS — ESTIMATE & COST"
            width={1200}
            height={630}
            priority
            className="login-og-image"
          />
        </div>
        <div className="relative z-10 mx-auto -mt-6 max-w-xl px-4 pb-10 sm:-mt-10">
          <div className="steel-plate paper-grain px-5 py-6 sm:px-7">
            <p className="mb-5 text-center font-mono text-[11px] tracking-[0.28em] text-steel-glow">
              FORGEBOOK · OWNER DESK · PROJECT CONTROLS
            </p>
            <LoginForm />
            <ClaimInviteForm />
            <p className="mt-6 text-center font-mono text-[10px] leading-5 tracking-[0.12em] text-paper-cream/45">
              Invite only. Owner: Robert Henderson. Not a public product.
            </p>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
