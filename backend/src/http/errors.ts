export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
  ) {
    super(code)
    this.name = 'ApiError'
  }
}

export function unauthorized() {
  return new ApiError(401, 'not_authenticated')
}

export function forbidden() {
  return new ApiError(403, 'forbidden')
}
