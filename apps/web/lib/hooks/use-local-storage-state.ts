"use client";

import * as React from "react";

export interface LocalStorageStateOptions<T> {
  serialize: (value: T) => string;
  deserialize: (raw: string) => T | null;
}

export function useLocalStorageState<T>(
  storageKey: string | null,
  initialState: T,
  options: LocalStorageStateOptions<T>,
  syncToken?: string | number,
): [T, (value: T) => void] {
  const optsRef = React.useRef(options);
  optsRef.current = options;
  const [state, setState] = React.useState<T>(initialState);

  React.useEffect(() => {
    if (!storageKey) {
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === null) {
        return;
      }
      const parsed = optsRef.current.deserialize(raw);
      if (parsed !== null) {
        setState(parsed);
      }
    } catch {
      // localStorage may be unavailable (privacy mode, quota, SSR); fall back to initialState.
    }
  }, [storageKey, syncToken]);

  const setValue = React.useCallback(
    (next: T) => {
      setState(next);
      if (!storageKey) {
        return;
      }
      try {
        window.localStorage.setItem(
          storageKey,
          optsRef.current.serialize(next),
        );
      } catch {
        // Persistence is best-effort; in-memory state already updated above.
      }
    },
    [storageKey],
  );

  return [state, setValue];
}
