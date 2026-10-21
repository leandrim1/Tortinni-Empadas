import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
}

/** Carregamento com estados explícitos e proteção contra resposta fora de ordem. */
export function useAsync<T>(factory: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  const run = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    const ticket = ++latest.current;
    let active = true;
    setLoading(true);
    setError(undefined);

    factory()
      .then((result) => {
        if (!active || ticket !== latest.current) return;
        setData(result);
      })
      .catch((caught: unknown) => {
        if (!active || ticket !== latest.current) return;
        setError(caught instanceof Error ? caught : new Error(String(caught)));
      })
      .finally(() => {
        if (!active || ticket !== latest.current) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload: run };
}
