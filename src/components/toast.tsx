"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Toast = { id: number; text: string; bad?: boolean };
type ToastApi = { toast: (text: string, opts?: { bad?: boolean }) => void };

const ToastContext = createContext<ToastApi>({ toast: () => undefined });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const toast = useCallback<ToastApi["toast"]>((text, opts) => {
    const id = Date.now() + Math.random();
    setItems((all) => [...all.slice(-2), { id, text, bad: opts?.bad }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);
  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast${t.bad ? " bad" : ""}`}>
            <span className="head" aria-hidden="true" />
            <span>{t.text}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss">Close</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
