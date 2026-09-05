"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HoldScreen } from "@/components/HoldScreen";
import { useSession } from "@/components/SessionProvider";

export function AuthGate({
  children,
  require,
}: {
  children: React.ReactNode;
  require: "authenticated" | "anonymous";
}) {
  const router = useRouter();
  const { status, user } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    if (require === "authenticated" && (status !== "authenticated" || !user)) {
      router.replace("/login");
    }
    if (require === "anonymous" && status === "authenticated" && user) {
      router.replace("/");
    }
  }, [require, router, status, user]);

  if (status === "loading") {
    return <HoldScreen label="CHECKING DESK SESSION" />;
  }

  if (require === "authenticated" && (status !== "authenticated" || !user)) {
    return <HoldScreen label="HOLDING FOR SESSION" />;
  }

  if (require === "anonymous" && status === "authenticated" && user) {
    return <HoldScreen label="OPENING DESK" />;
  }

  return <>{children}</>;
}
