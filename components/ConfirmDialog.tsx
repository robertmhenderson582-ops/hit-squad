"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useDisplay } from "@/components/DisplayProvider";

type Request = {
  name: string;
  resolve: (ok: boolean) => void;
};

const ConfirmContext = createContext<(name: string) => Promise<boolean>>(() => Promise.resolve(true));

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const { prefs } = useDisplay();
  const [request, setRequest] = useState<Request | null>(null);

  const confirmRemove = useCallback(
    (name: string) => {
      if (!prefs.confirmDelete) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => setRequest({ name, resolve }));
    },
    [prefs.confirmDelete],
  );

  function answer(ok: boolean) {
    request?.resolve(ok);
    setRequest(null);
  }

  return (
    <ConfirmContext.Provider value={confirmRemove}>
      {children}
      {request ? (
        <div className="modal-scrim">
          <div className="estimate-modal px-6 py-5">
            <h2 className="font-display text-2xl text-[#163038]">Remove estimate</h2>
            <p className="mt-2 text-sm text-[#5b6f73]">{request.name}</p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => answer(false)} className="rounded-lg border border-steel px-4 py-2 text-steel">
                Cancel
              </button>
              <button type="button" onClick={() => answer(true)} className="rounded-lg bg-steel px-4 py-2 text-white">
                Remove estimate
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirmRemove() {
  return useContext(ConfirmContext);
}
