"use client";

import { useEffect, useState } from "react";
import { useLensUser } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import {
  asEstimateRecord,
  ensureSeatEstimates,
  workingCopies,
  type SeatEstimate,
} from "@/lib/seat-estimates";

export function useSeatEstimates() {
  const { user } = useSession();
  const lens = useLensUser();
  const seatId = lens?.id || user?.id || "";
  const seatName = lens?.name || user?.name || "Owner";
  const [list, setList] = useState<SeatEstimate[]>([]);

  useEffect(() => {
    if (!seatId) return;
    setList(ensureSeatEstimates(seatId, seatName));
  }, [seatId, seatName]);

  const working = workingCopies(list);
  return {
    seatId,
    seatName,
    list,
    working,
    records: working.map((row) => asEstimateRecord(row, seatId)),
  };
}
