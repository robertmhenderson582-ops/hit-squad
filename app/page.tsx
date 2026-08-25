"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { DeskHome } from "@/components/DeskHome";

export default function DeskPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="THE DESK" hideTitle variant="hero">
        <DeskHome />
      </DeskChrome>
    </AuthGate>
  );
}
