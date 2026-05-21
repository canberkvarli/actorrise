import type { z } from "zod";

export type AuthTokenProvider = () => Promise<string | undefined>;

export interface ApiClientOptions {
  baseUrl: string;
  getToken: AuthTokenProvider;
  defaultTimeoutMs?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions<TResponse> {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  schema?: z.ZodType<TResponse>;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface ApiClient {
  /**
   * Generic typed request. Pass a Zod schema to validate and narrow the
   * response. If no schema is given, returns `unknown` — callers should
   * always pass a schema unless dealing with raw bytes.
   */
  request<TResponse>(opts: RequestOptions<TResponse>): Promise<TResponse>;

  /** Convenience GET. */
  get<TResponse>(
    path: string,
    opts?: Omit<RequestOptions<TResponse>, "path" | "method">,
  ): Promise<TResponse>;

  /** Convenience POST with JSON body. */
  post<TResponse>(
    path: string,
    body: unknown,
    opts?: Omit<RequestOptions<TResponse>, "path" | "method" | "body">,
  ): Promise<TResponse>;

  /** Convenience PATCH with JSON body. */
  patch<TResponse>(
    path: string,
    body: unknown,
    opts?: Omit<RequestOptions<TResponse>, "path" | "method" | "body">,
  ): Promise<TResponse>;

  /** Convenience DELETE. */
  delete<TResponse>(
    path: string,
    opts?: Omit<RequestOptions<TResponse>, "path" | "method">,
  ): Promise<TResponse>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function createApiClient(options: ApiClientOptions): ApiClient {
  const defaultTimeout = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<TResponse>(opts: RequestOptions<TResponse>): Promise<TResponse> {
    const url = new URL(opts.path, options.baseUrl);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const token = await options.getToken();
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(opts.headers ?? {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? defaultTimeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const signal = opts.signal
      ? mergeSignals(opts.signal, controller.signal)
      : controller.signal;

    let response: Response;
    try {
      response = await fetch(url, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new ApiError(
        `${opts.method ?? "GET"} ${opts.path} failed: ${response.status}`,
        response.status,
        payload,
      );
    }

    if (opts.schema) {
      return opts.schema.parse(payload);
    }
    return payload as TResponse;
  }

  return {
    request,
    get: (path, opts) => request({ ...(opts ?? {}), path, method: "GET" }),
    post: (path, body, opts) =>
      request({ ...(opts ?? {}), path, method: "POST", body }),
    patch: (path, body, opts) =>
      request({ ...(opts ?? {}), path, method: "PATCH", body }),
    delete: (path, opts) => request({ ...(opts ?? {}), path, method: "DELETE" }),
  };
}

function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (a.aborted) return a;
  if (b.aborted) return b;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}
