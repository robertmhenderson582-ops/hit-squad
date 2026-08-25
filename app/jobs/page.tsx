"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";

export default function JobsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sites");
  }, [router]);

  return (
    <AuthGate require="authenticated">
      <div className="industrial-root flex min-h-screen items-center justify-center">
        <p className="font-mono text-xs tracking-[0.24em] text-steel-glow">OPENING SITES</p>
      </div>
    </AuthGate>
  );
}
