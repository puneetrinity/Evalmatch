import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { authService } from './firebase';

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
): Promise<Response> {
  // Get auth token with retry
  let token = await authService.getAuthToken();
  
  // If no token, try one more time with force refresh
  if (!token) {
    console.log('No token found, retrying with force refresh...');
    token = await authService.getAuthToken(true);
  }
  
  // Prepare headers
  const headers: Record<string, string> = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };

  console.log('Making API request to:', url, 'with auth token:', token ? 'YES' : 'NO');

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
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
  async ({ queryKey }) => {
    // Get auth token with retry
    let token = await authService.getAuthToken();
    
    // If no token, try one more time with force refresh
    if (!token) {
      console.log('Query: No token found, retrying with force refresh...');
      token = await authService.getAuthToken(true);
    }
    
    // Prepare headers
    const headers: Record<string, string> = {
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    };

    console.log('Making query request to:', queryKey[0], 'with auth token:', token ? 'YES' : 'NO');

    const res = await fetch(queryKey[0] as string, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      console.log('Query returned 401, returning null');
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
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
