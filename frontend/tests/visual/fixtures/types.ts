export interface MockRequest {
  method: string
  /** Caminho sem o prefixo /api, ex.: /platform/organizations */
  path: string
  url: URL
  query: URLSearchParams
  /** Corpo JSON da requisicao (quando houver). */
  body: unknown
  /** Grupos nomeados/posicionais da expressao do caminho. */
  params: string[]
}

export type MockResult = unknown | { __status: number; body: unknown }

export interface MockRoute {
  /** Metodo(s) HTTP. Omitido = qualquer um. */
  method?: string | string[]
  /** Caminho sem o prefixo /api. String = igualdade exata; RegExp = teste no caminho. */
  path: string | RegExp
  respond: (req: MockRequest) => MockResult
}

export function status(code: number, body: unknown): MockResult {
  return { __status: code, body }
}

export function isStatusResult(value: unknown): value is { __status: number; body: unknown } {
  return Boolean(value) && typeof value === 'object' && '__status' in (value as object)
}
