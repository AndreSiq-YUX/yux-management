export interface PortalGlossaryEntry {
  /** Termo interno ou técnico que não deve aparecer para o cliente. */
  avoid: string
  /** Termo que o portal deve usar. */
  use: string
  note?: string
}

/** Tarefa 2.5: tradução de jargão interno para a linguagem do cliente. */
export const PORTAL_GLOSSARY: PortalGlossaryEntry[] = [
  { avoid: 'Pipeline', use: 'Funil' },
  { avoid: 'Handoff', use: 'Transferência para atendente' },
  { avoid: 'SLA', use: 'Prazo de resposta' },
  { avoid: 'Trigger', use: 'Gatilho' },
  { avoid: 'Endpoint / token', use: 'Endereço de envio / chave', note: 'Somente na seção "Avançado".' },
  { avoid: 'Score', use: 'Pontuação' },
  { avoid: 'Fit / intenção', use: 'Perfil / interesse', note: 'Acompanhar de uma explicação curta.' },
  { avoid: 'Guardrails', use: 'O que usar e o que evitar' },
  { avoid: 'Cockpit, Pulso Executivo', use: 'Resumo, Pulso do período' },
  { avoid: 'Action Engine, execução governada, pack', use: '(remover)', note: 'Termos internos: não aparecem no portal.' },
  { avoid: 'Persistido(s)', use: 'Salvo(s)' },
  { avoid: '"… do contrato" no título', use: 'Nome da área', note: 'O contexto do contrato fica nas etiquetas.' },
  {
    avoid: 'CPL, MROI',
    use: 'Custo por lead (CPL), Retorno sobre marketing (MROI)',
    note: 'Explicar ao passar o mouse e em texto no celular.',
  },
]

/** Termos que não podem aparecer em textos visíveis ao cliente no portal. */
export const PORTAL_FORBIDDEN_TERMS: string[] = [
  'YUX Hub',
  'Action Engine',
  'persistidos',
  'persistido',
  'Doutrina',
  'governada',
  'Cockpit',
  'Harness',
  'Action Pack',
]
