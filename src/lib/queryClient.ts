import { createContext, createElement, type PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';

type QueryKey = unknown[] | readonly unknown[] | string;

type QueryOptions<TData> = {
  queryKey: QueryKey;
  queryFn: () => Promise<TData> | TData;
  enabled?: boolean;
};

type QueryResult<TData> = {
  data: TData | undefined;
  error: Error | null;
  isLoading: boolean;
  refetch: () => Promise<TData | undefined>;
};

type MutationOptions<TData, TVariables> = {
  mutationFn: (variables: TVariables) => Promise<TData> | TData;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
};

type MutationResult<TData, TVariables> = {
  mutate: (variables: TVariables) => Promise<TData>;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  data: TData | undefined;
  error: Error | null;
  isPending: boolean;
};

function normaliseKey(key: QueryKey): string {
  return typeof key === 'string' ? key : JSON.stringify(key);
}

class InMemoryCache {
  private store = new Map<string, unknown>();

  get<T>(key: QueryKey): T | undefined {
    return this.store.get(normaliseKey(key)) as T | undefined;
  }

  set<T>(key: QueryKey, value: T) {
    this.store.set(normaliseKey(key), value);
  }

  delete(key: QueryKey) {
    this.store.delete(normaliseKey(key));
  }

  keys() {
    return Array.from(this.store.keys());
  }
}

export class QueryClient {
  private cache = new InMemoryCache();
  private listeners = new Map<string, Set<() => void>>();

  getQueryData<T>(key: QueryKey): T | undefined {
    return this.cache.get<T>(key);
  }

  setQueryData<T>(key: QueryKey, value: T) {
    this.cache.set(key, value);
    this.emit(key);
  }

  invalidateQueries(predicate?: (key: string) => boolean) {
    for (const key of this.cache.keys()) {
      if (!predicate || predicate(key)) {
        this.emit(key);
      }
    }
  }

  subscribe(key: QueryKey, listener: () => void) {
    const normalised = normaliseKey(key);
    if (!this.listeners.has(normalised)) {
      this.listeners.set(normalised, new Set());
    }
    this.listeners.get(normalised)!.add(listener);
    return () => {
      const set = this.listeners.get(normalised);
      if (!set) return;
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(normalised);
      }
    };
  }

  private emit(key: QueryKey) {
    const listeners = this.listeners.get(normaliseKey(key));
    listeners?.forEach((listener) => listener());
  }
}

const QueryClientContext = createContext<QueryClient | null>(null);

export function QueryClientProvider({ client, children }: PropsWithChildren<{ client: QueryClient }>) {
  return createElement(QueryClientContext.Provider, { value: client }, children);
}

export function useQueryClient() {
  const context = useContext(QueryClientContext);
  if (!context) {
    throw new Error('useQueryClient must be used within a QueryClientProvider');
  }
  return context;
}

export function useQuery<TData>({ queryKey, queryFn, enabled = true }: QueryOptions<TData>): QueryResult<TData> {
  const client = useQueryClient();
  const keyRef = useRef(queryKey);
  keyRef.current = queryKey;
  const [data, setData] = useState<TData | undefined>(() => client.getQueryData<TData>(queryKey));
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(enabled && !client.getQueryData<TData>(queryKey));

  const execute = useCallback(async () => {
    if (!enabled) return data;
    setIsLoading(true);
    try {
      const result = await queryFn();
      client.setQueryData(keyRef.current, result);
      setData(result);
      setError(null);
      return result;
    } catch (err) {
      const errorInstance = err instanceof Error ? err : new Error('Unknown query error');
      setError(errorInstance);
      throw errorInstance;
    } finally {
      setIsLoading(false);
    }
  }, [client, data, enabled, queryFn]);

  useEffect(() => {
    const unsubscribe = client.subscribe(queryKey, () => {
      const cached = client.getQueryData<TData>(queryKey);
      setData(cached);
    });
    return unsubscribe;
  }, [client, queryKey]);

  useEffect(() => {
    if (enabled && !client.getQueryData<TData>(queryKey)) {
      void execute();
    }
  }, [client, enabled, execute, queryKey]);

  return {
    data,
    error,
    isLoading,
    refetch: () => execute()
  };
}

export function useMutation<TData, TVariables>({ mutationFn, onSuccess, onError }: MutationOptions<TData, TVariables>): MutationResult<TData, TVariables> {
  const [data, setData] = useState<TData | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (variables: TVariables) => {
      setIsPending(true);
      setError(null);
      try {
        const result = await mutationFn(variables);
        setData(result);
        onSuccess?.(result, variables);
        return result;
      } catch (err) {
        const errorInstance = err instanceof Error ? err : new Error('Unknown mutation error');
        setError(errorInstance);
        onError?.(errorInstance, variables);
        throw errorInstance;
      } finally {
        setIsPending(false);
      }
    },
    [mutationFn, onError, onSuccess]
  );

  return {
    mutate,
    mutateAsync: mutate,
    data,
    error,
    isPending
  };
}

