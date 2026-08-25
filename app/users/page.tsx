"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";

export default function UsersRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/users");
  }, [router]);
  return (
    <AuthGate require="authenticated">
      <p className="p-6 text-sm text-[#5b6f73]">Opening Settings → Manage users…</p>
    </AuthGate>
  );
}
