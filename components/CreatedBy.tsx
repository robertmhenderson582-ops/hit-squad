"use client";

import { useLensUser } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { isTester } from "@/lib/desk-role";

export function CreatedBy({ author }: { author: string }) {
  const { user } = useSession();
  const lens = useLensUser();
  const yours = Boolean(lens && author === lens.name) || Boolean(user && !isTester(lens) && author === user.name);

  if (yours) {
    return <span className="yours-pill">Yours</span>;
  }
  if (isTester(lens)) return null;
  return <span className="prepared-by">Prepared by {author}</span>;
}
