import { describe, expect, it, vi } from 'vitest'
import { readJinaUrl, searchJinaWeb } from '../src/modules/radar/jinaClient.js'

describe('radar jina client', () => {
  it('reads a public URL and extracts contact evidence', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          title: 'Clinica Boa Vida',
          url: 'https://boavida.com.br',
          content: '# Clinica Boa Vida\n\nAgende sua consulta pelo contato@boavida.com.br ou WhatsApp (43) 99999-0000.\n\n[Contato](https://boavida.com.br/contato)',
        },
      }),
    })) as never

    const result = await readJinaUrl('https://boavida.com.br', { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledWith('https://r.jina.ai/https://boavida.com.br', expect.objectContaining({
      headers: expect.objectContaining({ Accept: 'application/json', 'X-Respond-With': 'markdown' }),
    }))
    expect(result).toMatchObject({
      title: 'Clinica Boa Vida',
      url: 'https://boavida.com.br',
      emails: ['contato@boavida.com.br'],
      ctaTerms: expect.arrayContaining(['agende', 'whatsapp']),
    })
    expect(result.phones[0]).toContain('43')
    expect(result.links).toEqual(['https://boavida.com.br/contato'])
  })

  it('searches Jina and normalizes result snippets', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          {
            title: 'Clinica Um',
            url: 'https://clinicaum.com.br',
            description: 'Clinica local em Londrina.',
            content: 'Clinica local em Londrina com atendimento por WhatsApp.',
          },
        ],
      }),
    })) as never

    const result = await searchJinaWeb('clinicas Londrina', { fetchImpl, limit: 1 })

    expect(fetchImpl).toHaveBeenCalledWith('https://s.jina.ai/clinicas%20Londrina', expect.any(Object))
    expect(result).toEqual([
      expect.objectContaining({
        title: 'Clinica Um',
        url: 'https://clinicaum.com.br',
        snippet: 'Clinica local em Londrina.',
      }),
    ])
  })

  it('throws a governed error when Jina fails', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 429 })) as never

    await expect(readJinaUrl('https://boavida.com.br', { fetchImpl })).rejects.toThrow('jina_request_failed')
  })
})

