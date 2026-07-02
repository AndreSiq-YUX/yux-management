import { RADAR_SMALL_BATCH_LIMIT } from './sourceRules.js'

export type RadarCsvRow = {
  tradeName?: string
  legalName?: string
  cnpj?: string
  cnaeMain?: string
  city?: string
  state?: string
  websiteUrl?: string
  emailRaw?: string
  phoneRaw?: string
  sourceUrl?: string
  notes?: string
}

export type RadarCsvImportIssue = {
  rowNumber: number
  code: string
  message: string
}

const headerMap: Record<string, keyof RadarCsvRow> = {
  trade_name: 'tradeName',
  legal_name: 'legalName',
  cnpj: 'cnpj',
  cnae_main: 'cnaeMain',
  city: 'city',
  state: 'state',
  website_url: 'websiteUrl',
  email_raw: 'emailRaw',
  phone_raw: 'phoneRaw',
  source_url: 'sourceUrl',
  notes: 'notes',
}

export function parseRadarCsv(csv: string, limit = RADAR_SMALL_BATCH_LIMIT) {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim().length > 0)
  if (lines.length < 2) {
    return { rows: [], issues: [{ rowNumber: 0, code: 'empty_csv', message: 'CSV sem linhas de dados.' }] }
  }

  const headers = splitCsvLine(lines[0]).map(header => header.trim().toLowerCase())
  const mappedHeaders = headers.map(header => headerMap[header])
  const rows: RadarCsvRow[] = []
  const issues: RadarCsvImportIssue[] = []

  for (const [index, line] of lines.slice(1).entries()) {
    const rowNumber = index + 2
    if (rows.length >= limit) {
      issues.push({ rowNumber, code: 'batch_limit_exceeded', message: `Limite de ${limit} linhas excedido.` })
      continue
    }

    const values = splitCsvLine(line)
    const row: RadarCsvRow = {}
    mappedHeaders.forEach((key, columnIndex) => {
      if (key) row[key] = values[columnIndex]?.trim() || undefined
    })

    if (!row.tradeName && !row.legalName && !row.websiteUrl) {
      issues.push({ rowNumber, code: 'missing_name_or_site', message: 'Informe nome fantasia, razao social ou site.' })
      continue
    }

    rows.push(row)
  }

  return { rows, issues }
}

function splitCsvLine(line: string) {
  const values: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      values.push(current)
      current = ''
    } else {
      current += char
    }
  }

  values.push(current)
  return values
}
