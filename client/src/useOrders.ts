import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isAbortError, listOrders } from './api';
import type { Filters, Order } from './api';

export function useOrders(filters: Filters, reloadKey: number, onUnauthorized: () => void) {
  const [items, setItems] = useState<Order[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const fail = useCallback(
    (err: unknown) => {
      if (isAbortError(err)) return;
      if (err instanceof ApiError && err.status === 401) return onUnauthorized();
      setError(err instanceof Error ? err.message : 'Something went wrong');
    },
    [onUnauthorized],
  );

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setItems([]);
    setNextCursor(null);
    setError(null);
    setLoading(true);

    listOrders(filters, null, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        fail(err);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.status, filters.sort, filters.dir, reloadKey]);

  const loadMore = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    listOrders(filters, nextCursor, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems((current) => [...current, ...page.items]);
        setNextCursor(page.nextCursor);
        setLoadingMore(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadingMore(false);
        fail(err);
      });
  }, [filters, nextCursor, loadingMore, fail]);

  return { items, loading, loadingMore, error, hasMore: nextCursor !== null, loadMore };
}
