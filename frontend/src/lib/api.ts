const TOKEN_KEY = "prm_token";

export function getApiBase(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  return env?.replace(/\/$/, "") ?? "";
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export type UserRole = "admin" | "manager" | "user";

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface ApiError {
  error: { code: string; message: string };
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const base = getApiBase();
  const url = `${base}/api/v1${path.startsWith("/") ? path : `/${path}`}`;
  const headers: HeadersInit = {
    Accept: "application/json",
    ...(options.json !== undefined ? { "Content-Type": "application/json" } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };
  const token = getToken();
  if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, {
    ...options,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });
  const data = await parseJson<T & ApiError>(res);
  if (!res.ok) {
    const err = data as ApiError;
    const msg = err.error?.message ?? res.statusText;
    throw new Error(msg);
  }
  return data as T;
}
