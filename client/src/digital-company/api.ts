/**
 * Single entry point for Office data. In the standalone dev app it calls the
 * Express adapter (/api/digital-company/*). Inside the Hermes Dashboard plugin
 * a different backend is installed (see plugin/dataSource.ts) that computes
 * the same responses in the browser from the plugin's raw data API.
 */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export type ApiBackend = (path: string) => Promise<unknown>

const httpBackend: ApiBackend = async (path) => {
  const res = await fetch(`/api/digital-company${path}`, { cache: 'no-store' })
  if (!res.ok) {
    throw new ApiError(res.status === 503 ? 'Hermes Kanban is unavailable' : `HTTP ${res.status}`, res.status)
  }
  return res.json()
}

let backend: ApiBackend = httpBackend

export function setApiBackend(next: ApiBackend): void {
  backend = next
}

export function apiGet<T>(path: string): Promise<T> {
  return backend(path) as Promise<T>
}
