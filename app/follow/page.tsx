"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";

export default function FollowRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/follow");
  }, [router]);

  return (
    <AuthGate require="authenticated">
      <p className="p-6 text-sm text-[#5b6f73]">Opening Settings / Follow…</p>
    </AuthGate>
  );
}
