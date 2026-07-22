"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

const TARS_ENABLED_KEY = "ctrlteach_tars_enabled";

type TarsContextValue = {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  extensionAvailable: boolean | null;
  setExtensionAvailable: (next: boolean) => void;
  status: string;
  setStatus: Dispatch<SetStateAction<string>>;
  trainingOpen: boolean;
  setTrainingOpen: (next: boolean) => void;
  openTraining: () => void;
  closeTraining: () => void;
};

const TarsContext = createContext<TarsContextValue | null>(null);

export function TarsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [status, setStatus] = useState("Tars asleep");
  const [extensionAvailable, setExtensionAvailable] = useState<boolean | null>(null);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setEnabledState(localStorage.getItem(TARS_ENABLED_KEY) === "1");
    } catch {}
    setHydrated(true);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      localStorage.setItem(TARS_ENABLED_KEY, next ? "1" : "0");
    } catch {}
  }, []);

  const openTraining = useCallback(() => setTrainingOpen(true), []);
  const closeTraining = useCallback(() => setTrainingOpen(false), []);

  const value = useMemo<TarsContextValue>(
    () => ({
      enabled,
      setEnabled,
      extensionAvailable,
      setExtensionAvailable,
      status,
      setStatus,
      trainingOpen,
      setTrainingOpen,
      openTraining,
      closeTraining,
    }),
    [enabled, setEnabled, extensionAvailable, status, trainingOpen, openTraining, closeTraining]
  );

  return <TarsContext.Provider value={value}>{children}</TarsContext.Provider>;
}

export function useTars(): TarsContextValue {
  const ctx = useContext(TarsContext);
  if (!ctx) {
    throw new Error("useTars must be used within TarsProvider");
  }
  return ctx;
}

export { TARS_ENABLED_KEY };
