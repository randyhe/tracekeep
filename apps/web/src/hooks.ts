import { useCallback, useEffect, useState } from "react";

export function useAsync<T>(loader: () => Promise<T>, dependencies: readonly unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [sequence, setSequence] = useState(0);

  const reload = useCallback(() => setSequence((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    loader().then((result) => {
      if (active) setData(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason : new Error("Unexpected error"));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
    // The caller controls refresh dependencies explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, sequence]);

  return { data, error, loading, reload, setData };
}

export function usePersistentDraft(key: string, legacyKey?: string) {
  const [value, setValue] = useState(() => localStorage.getItem(key) ?? (legacyKey ? localStorage.getItem(legacyKey) : null) ?? "");
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [key, value]);
  return [value, setValue] as const;
}
