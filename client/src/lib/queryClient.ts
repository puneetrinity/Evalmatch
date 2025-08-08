import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { authManager } from './auth-manager';

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { headers?: Record<string, string>; signal?: AbortSignal }
): Promise<Response> {
  // Get auth token using simplified auth manager
  const token = await authManager.getAuthToken();
  
  // Prepare headers
  const headers: Record<string, string> = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...(options?.headers || {}),
  };

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    signal: options?.signal,
  });

  // If 401 and we have no token, throw a more specific error
  if (res.status === 401 && !token) {
    throw new Error('Authentication required. Please log in again.');
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    // Get auth token using simplified auth manager
    const token = await authManager.getAuthToken();
    
    // Prepare headers
    const headers: Record<string, string> = {
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    };

    const res = await fetch(queryKey[0] as string, {
      headers,
      credentials: "include",
      signal, // Pass abort signal to fetch
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
      gcTime: 5 * 60 * 1000, // 5 minutes garbage collection time
      retry: false,
      networkMode: 'online', // Only fetch when online
    },
    mutations: {
      retry: false,
      networkMode: 'online',
    },
  },
});
