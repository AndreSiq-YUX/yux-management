import { apiRequest } from '@/lib/apiClient'

export function invokeBackendFunction<T = unknown>(name: string, body: unknown = {}) {
  return apiRequest<T>(`/functions/${name}`, {
    method: 'POST',
    body: { body },
  })
}
