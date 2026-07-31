import { describe, expect, it } from 'vitest'
import { parseRadarCsv } from '../src/modules/radar/csvImport.js'

describe('parseRadarCsv', () => {
  it('parses valid rows and reports invalid rows', () => {
    const result = parseRadarCsv([
      'trade_name,city,state,website_url',
      'Clinica Boa Vida,Londrina,PR,https://boavida.com.br',
      ',Londrina,PR,',
    ].join('\n'))

    expect(result.rows).toEqual([
      expect.objectContaining({ tradeName: 'Clinica Boa Vida', websiteUrl: 'https://boavida.com.br' }),
    ])
    expect(result.issues).toEqual([
      expect.objectContaining({ rowNumber: 3, code: 'missing_name_or_site' }),
    ])
  })

  it('enforces the small batch limit', () => {
    const csv = ['trade_name', ...Array.from({ length: 11 }, (_, index) => `Empresa ${index + 1}`)].join('\n')
    const result = parseRadarCsv(csv, 10)

    expect(result.rows).toHaveLength(10)
    expect(result.issues).toEqual([expect.objectContaining({ code: 'batch_limit_exceeded' })])
  })
})
