"use client";

import { AuthGate } from "@/components/AuthGate";
import { FieldTrialBanner } from "@/components/FieldTrialBanner";
import { LoginForm } from "@/components/LoginForm";
import { Wordmark } from "@/components/Wordmark";

export default function LoginPage() {
  return (
    <AuthGate require="anonymous">
      <div className="industrial-root">
        <div className="plant-silhouette" />
        <span className="flare" />
        <FieldTrialBanner />
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-40px)] max-w-xl items-center px-4 py-10">
          <div className="steel-plate paper-grain w-full px-6 py-8 sm:px-8">
            <Wordmark />
            <p className="mt-5 text-center font-mono text-[11px] tracking-[0.28em] text-steel-glow">
              FORGEBOOK · OWNER DESK
            </p>
            <div className="mt-8">
              <LoginForm />
            </div>
            <p className="mt-8 text-center font-mono text-[10px] leading-5 tracking-[0.12em] text-paper-cream/45">
              Invite only. Owner: Robert Henderson. Not a public product.
            </p>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
