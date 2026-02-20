import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getSessionHeaders } from "./sessionUtils";

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
  const headers = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...getSessionHeaders(),
  };

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await apiRequest('GET', url);
  return await res.json();
}

export async function postJson<T>(url: string, data?: unknown): Promise<T> {
  const res = await apiRequest('POST', url, data);
  return await res.json();
}

export async function patchJson<T>(url: string, data?: unknown): Promise<T> {
  const res = await apiRequest('PATCH', url, data);
  return await res.json();
}

export async function deleteJson<T>(url: string): Promise<T> {
  const res = await apiRequest('DELETE', url);
  return await res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      headers: getSessionHeaders(),
      credentials: "include",
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
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
