"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";

function HoldScreen({ label }: { label: string }) {
  return (
    <div className="industrial-root flex min-h-screen items-center justify-center">
      <div className="font-mono text-xs tracking-[0.28em] text-steel-glow">{label}</div>
    </div>
  );
}

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
