"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

const CLICKY_ENABLED_KEY = "ctrlteach_clicky_enabled";

type ClickyContextValue = {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  status: string;
  setStatus: Dispatch<SetStateAction<string>>;
  trainingOpen: boolean;
  setTrainingOpen: (next: boolean) => void;
  openTraining: () => void;
  closeTraining: () => void;
};

const ClickyContext = createContext<ClickyContextValue | null>(null);

export function ClickyProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [status, setStatus] = useState("Clicky asleep");
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setEnabledState(localStorage.getItem(CLICKY_ENABLED_KEY) === "1");
    } catch {}
    setHydrated(true);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      localStorage.setItem(CLICKY_ENABLED_KEY, next ? "1" : "0");
    } catch {}
  }, []);

  const openTraining = useCallback(() => setTrainingOpen(true), []);
  const closeTraining = useCallback(() => setTrainingOpen(false), []);

  const value = useMemo<ClickyContextValue>(
    () => ({
      enabled,
      setEnabled,
      status,
      setStatus,
      trainingOpen,
      setTrainingOpen,
      openTraining,
      closeTraining,
    }),
    [enabled, setEnabled, status, trainingOpen, openTraining, closeTraining]
  );

  return <ClickyContext.Provider value={value}>{children}</ClickyContext.Provider>;
}

export function useClicky(): ClickyContextValue {
  const ctx = useContext(ClickyContext);
  if (!ctx) {
    throw new Error("useClicky must be used within ClickyProvider");
  }
  return ctx;
}

export { CLICKY_ENABLED_KEY };
