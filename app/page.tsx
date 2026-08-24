"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { DeskHome } from "@/components/DeskHome";

export default function DeskPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="THE DESK">
        <p className="mt-2 max-w-3xl text-sm leading-6 text-paper-cream/80">
          Private outage, T&amp;M, cost, and HSE rail. Records on this board belong to the signed-in
          owner only. Field trial — not a release.
        </p>
        <DeskHome />
      </DeskChrome>
    </AuthGate>
  );
}
