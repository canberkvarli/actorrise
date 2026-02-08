import { supabase } from "./supabase";

// Production API (Render). Override with NEXT_PUBLIC_API_URL in Vercel if using a custom domain.
export const PRODUCTION_API_URL = "https://actorrise-api.onrender.com";
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.VERCEL ? PRODUCTION_API_URL : "http://localhost:8000");

// Fetch wrapper that mimics axios API for easy migration
async function request<T = unknown>(
  method: string,
  url: string,
  data?: unknown,
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

  // Prepare headers - use Record<string, string> to allow property assignment
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  // Make request with redirect handling
  let response: Response;
  try {
    response = await fetch(fullUrl, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      redirect: 'follow', // Explicitly follow redirects
      ...options,
    });
  } catch (err) {
    const message =
      err instanceof TypeError && (err as Error).message === "Failed to fetch"
        ? `Backend unreachable at ${fullUrl}. Is the API running? For local dev: start the backend (e.g. \`cd backend && uv run uvicorn app.main:app --reload\`) and set NEXT_PUBLIC_API_URL=http://localhost:8000 if needed.`
        : (err as Error).message;
    throw new Error(message);
  }

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
  
  try {
    if (contentType && contentType.includes("application/json")) {
      responseData = await response.json();
    } else {
      const text = await response.text();
      responseData = text as unknown as T;
    }
  } catch (parseError) {
    // If parsing fails, use empty object
    responseData = {} as T;
  }

  // Throw error for non-2xx responses (mimics axios behavior)
  if (!response.ok) {
    // Try to extract error message from response
    let errorMessage = response.statusText || "Request failed";
    if (responseData && typeof responseData === 'object') {
      const errorObj = responseData as any;
      if (errorObj.detail) {
        errorMessage = errorObj.detail;
      } else if (errorObj.message) {
        errorMessage = errorObj.message;
      } else if (errorObj.error) {
        errorMessage = errorObj.error;
      }
    }
    
    const error = new Error(errorMessage) as Error & {
      response?: {
        status: number;
        statusText: string;
        data: T;
      };
    };
    error.response = {
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
  get: <T = unknown>(url: string, options?: RequestInit) =>
    request<T>("GET", url, undefined, options),
  post: <T = unknown>(url: string, data?: unknown, options?: RequestInit) =>
    request<T>("POST", url, data, options),
  put: <T = unknown>(url: string, data?: unknown, options?: RequestInit) =>
    request<T>("PUT", url, data, options),
  patch: <T = unknown>(url: string, data?: unknown, options?: RequestInit) =>
    request<T>("PATCH", url, data, options),
  delete: <T = unknown>(url: string, options?: RequestInit) =>
    request<T>("DELETE", url, undefined, options),
};

export default api;

// ============================================================================
// Upload API Functions
// ============================================================================

export interface MonologueUploadData {
  title: string;
  character_name: string;
  text: string;
  stage_directions?: string;
  play_title: string;
  author: string;
  character_gender?: string;
  character_age_range?: string;
  notes?: string;
}

export interface SceneLineUploadData {
  character_name: string;
  text: string;
  stage_direction?: string;
}

export interface SceneUploadData {
  title: string;
  play_title: string;
  author: string;
  description?: string;
  character_1_name: string;
  character_2_name: string;
  character_1_gender?: string;
  character_2_gender?: string;
  character_1_age_range?: string;
  character_2_age_range?: string;
  setting?: string;
  context_before?: string;
  context_after?: string;
  lines: SceneLineUploadData[];
}

export async function uploadMonologue(data: MonologueUploadData) {
  return api.post("/api/monologues/upload", data);
}

export async function uploadScene(data: SceneUploadData) {
  return api.post("/api/scenes/upload", data);
}


