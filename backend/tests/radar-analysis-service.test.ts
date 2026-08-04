import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../src/config/env.js'
import { executeRadarAnalysis } from '../src/modules/radar/analysis-service.js'

const ids = {
  run: '00000000-0000-4000-8000-000000000001',
  opportunity: '00000000-0000-4000-8000-000000000002',
  organization: '00000000-0000-4000-8000-000000000003',
  client: '00000000-0000-4000-8000-000000000007',
  contract: '00000000-0000-4000-8000-000000000008',
  campaign: '00000000-0000-4000-8000-000000000004',
  company: '00000000-0000-4000-8000-000000000005',
  agentRun: '00000000-0000-4000-8000-000000000006',
}

class FakeAnalysisPool {
  queries: Array<{ sql: string; params: unknown[] }> = []

  async connect() {
    return { query: this.query.bind(this), release() {} }
  }

  async query(sql: string, params: unknown[] = []) {
    this.queries.push({ sql, params })
    const normalized = sql.replace(/\s+/g, ' ').trim()
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) return { rows: [] }
    if (normalized.includes('FROM public.radar_enrichment_runs r')) {
      return { rows: [{
        run_id: ids.run,
        run_status: 'pending',
        organization_id: ids.organization,
        client_id: ids.client,
        contract_id: ids.contract,
        campaign_id: ids.campaign,
        company_record_id: ids.company,
        opportunity_id: ids.opportunity,
        strategy_profile_key: 'ai_sdr_comercial_1',
        target_segment: 'Clinicas',
        target_city: 'Londrina',
        target_state: 'PR',
        offer_type: 'Diagnostico YUX 48h',
        trade_name: 'Boa Vida',
        legal_name: 'Clinica Boa Vida',
        cnae_main: '8630-5/03',
        city: 'Londrina',
        state: 'PR',
        phone_raw: '(43) 99999-0000',
        email_raw: 'contato@boavida.com.br',
        website_url: 'https://boavida.com.br',
        source_type: 'jina_reader',
        source_url: 'https://boavida.com.br',
        address: null,
        public_email: null,
        public_phone: null,
        whatsapp: '5543999990000',
        instagram_url: null,
        linkedin_url: null,
        google_business_url: null,
      }] }
    }
    if (normalized.includes('INSERT INTO public.radar_diagnostics')) return { rows: [{ id: 'diagnostic-1' }] }
    if (normalized.includes('INSERT INTO public.radar_scores')) return { rows: [{ id: 'score-1' }] }
    if (normalized.includes('INSERT INTO public.radar_message_suggestions')) return { rows: [{ id: 'message-1' }] }
    return { rows: [] }
  }
}

const env = {
  YUX_AGENT_RUNTIME_URL: 'http://agent-runtime:8080',
  YUX_AGENT_RUNTIME_TOKEN: 'runtime-token',
} as AppEnv

afterEach(() => vi.unstubAllGlobals())

describe('Radar analysis service', () => {
  it('persists the validated Harness result and trace instead of a fixed score', async () => {
    const pool = new FakeAnalysisPool()
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      expect(body).toMatchObject({
        source: 'radar',
        mode: 'commercial_radar_local_niche',
        client_id: ids.client,
        contract_id: ids.contract,
      })
      expect(body.retrieval_context.chunks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'website', chunk_text: 'https://boavida.com.br' }),
      ]))
      return {
        ok: true,
        json: async () => ({
          run: { id: ids.agentRun },
          synthesis: {
            summary: 'Clinica com oportunidade comercial verificavel.',
            source: { type: 'jina_reader', url: 'https://boavida.com.br' },
            evidence: ['website'],
            pain_hypotheses: ['Captura de demanda sem cadencia clara.'],
            recommended_offer: 'Diagnostico YUX 48h',
            score: {
              total_score: 83,
              fit_score: 88,
              timing_score: 76,
              pain_score: 81,
              contactability_score: 92,
              budget_score: 62,
              personalization_score: 90,
              explanation: 'Boa aderencia e contatos publicos verificaveis.',
            },
            message: {
              channel: 'email',
              subject: 'Ideias para a Boa Vida',
              body: 'Posso compartilhar tres ideias praticas?',
              personalization_notes: 'Revisar antes de enviar.',
              evidence_used: ['website'],
            },
            risk_flags: [],
            policyDecision: {
              status: 'requires_human_approval',
              canSendAutomatically: false,
              canConvertToLead: true,
              blockedReasons: [],
              requiredReviewFields: ['message', 'evidence', 'risk_flags'],
            },
            provider: 'openrouter',
            model: 'openai/gpt-4.1-mini',
          },
        }),
      }
    }))

    const result = await executeRadarAnalysis(pool as never, env, { runId: ids.run, opportunityId: ids.opportunity })

    expect(result).toMatchObject({ status: 'succeeded', runId: ids.run })
    const scoreInsert = pool.queries.find(query => query.sql.includes('INSERT INTO public.radar_scores'))
    expect(scoreInsert?.params[4]).toBe(83)
    const runUpdate = pool.queries.find(query => query.sql.includes("SET status = 'succeeded'"))
    expect(runUpdate?.params[1]).toBe(ids.agentRun)
    expect(String(runUpdate?.params[2])).toContain('"canSendAutomatically":false')
  })
})
