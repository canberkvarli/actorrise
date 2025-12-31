import { supabase } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Fetch wrapper that mimics axios API for easy migration
async function request<T = any>(
  method: string,
  url: string,
  data?: any,
  options?: RequestInit
): Promise<{ data: T; status: number; statusText: string }> {
  // Get auth token
  let authToken: string | undefined;
  if (typeof window !== "undefined") {
    const { data: { session } } = await supabase.auth.getSession();
    authToken = session?.access_token;
  }

  // Build full URL
  const fullUrl = url.startsWith("http") ? url : `${API_URL}${url}`;

  // Prepare headers
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options?.headers,
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  // Make request
  const response = await fetch(fullUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    ...options,
  });

  // Handle 401 errors
  if (response.status === 401) {
    if (typeof window !== "undefined") {
      await supabase.auth.signOut();
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  // Parse response
  let responseData: T;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    responseData = await response.json();
  } else {
    responseData = (await response.text()) as unknown as T;
  }

  // Throw error for non-2xx responses (mimics axios behavior)
  if (!response.ok) {
    const error: any = new Error(response.statusText || "Request failed");
    (error as any).response = {
      status: response.status,
      statusText: response.statusText,
      data: responseData,
    };
    throw error;
  }

  return {
    data: responseData,
    status: response.status,
    statusText: response.statusText,
  };
}

// API object that mimics axios interface
export const api = {
  get: <T = any>(url: string, options?: RequestInit) =>
    request<T>("GET", url, undefined, options),
  post: <T = any>(url: string, data?: any, options?: RequestInit) =>
    request<T>("POST", url, data, options),
  put: <T = any>(url: string, data?: any, options?: RequestInit) =>
    request<T>("PUT", url, data, options),
  patch: <T = any>(url: string, data?: any, options?: RequestInit) =>
    request<T>("PATCH", url, data, options),
  delete: <T = any>(url: string, options?: RequestInit) =>
    request<T>("DELETE", url, undefined, options),
};

export default api;



