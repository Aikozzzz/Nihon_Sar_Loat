export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(action: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${action}`, { cache: "no-store", ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.error ?? "Something went wrong. Please try again.", response.status);
  return data as T;
}

export function post<T>(action: string, value: unknown = {}) {
  return api<T>(action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "The server could not be reached. Try again.";
}
