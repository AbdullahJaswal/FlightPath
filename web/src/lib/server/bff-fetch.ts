import { createIsomorphicFn } from "@tanstack/react-start"
import { apiUrl } from "./api-url"

// Browsers go through the /bff route, server code calls the API directly.
const baseUrl = createIsomorphicFn()
  .server(() => apiUrl)
  .client(() => "/bff")

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown
  ) {
    super(`api responded ${status}`)
    this.name = "ApiError"
  }
}

export async function bffFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!headers.has("accept")) headers.set("accept", "application/json")

  const res = await fetch(baseUrl() + path, { ...init, headers })
  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => null))
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
