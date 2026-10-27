export type PendingCode =
  | 'B1' | 'B2' | 'B3' | 'B5'
  | 'B6' | 'B7' | 'B8' | 'B9' | 'B10'
  | 'B11' | 'B12' | 'B13' | 'B14' | 'B15'
  | 'B16' | 'B17' | 'B18' | 'B19' | 'B20' | 'B21' | 'B22' | 'B23' | 'B24' | 'B25' | 'B26'

export interface PendingFeature {
  code: PendingCode
  /** Nome curto da função, em português. */
  title: string
  /** Frase exibida ao cliente explicando que a função está em implantação. */
  clientMessage: string
  /** Rotas do portal onde a pendência aparece. */
  screens: string[]
}

export const PENDING_FEATURES: Record<PendingCode, PendingFeature> = {
  B1: {
    code: 'B1',
    title: 'Pagamento, boleto/PIX e PDF da fatura',
    clientMessage: 'O pagamento online desta fatura está em implantação e será liberado em breve.',
    screens: ['/portal/financeiro', '/portal'],
  },
  B2: {
    code: 'B2',
    title: 'Importação de leads por CSV',
    clientMessage: 'A importação de leads por planilha CSV está em implantação e será liberada em breve.',
    screens: ['/portal/comercial/leads'],
  },
  B3: {
    code: 'B3',
    title: 'Aprovação de sugestões criativas',
    clientMessage: 'A aprovação e o pedido de ajuste de sugestões criativas estão em implantação e serão liberados em breve.',
    screens: ['/portal/marketing/criativos'],
  },
  B5: {
    code: 'B5',
    title: 'Prazo de resposta em Conversas',
    clientMessage: 'O indicador de prazo de resposta das conversas está em implantação e será liberado em breve.',
    screens: ['/portal/atendimento/conversas'],
  },
  B6: {
    code: 'B6',
    title: 'Período em Relatórios',
    clientMessage: 'A escolha de período nos relatórios está em implantação e será liberada em breve.',
    screens: ['/portal/relatorios'],
  },
  B7: {
    code: 'B7',
    title: 'Notificações e sessões',
    clientMessage: 'As preferências de notificação e o controle de sessões estão em implantação e serão liberados em breve.',
    screens: ['/portal/configuracoes/conta'],
  },
  B8: {
    code: 'B8',
    title: 'Reprocessar execução de automação',
    clientMessage: 'O reprocessamento de execuções de automação está em implantação e será liberado em breve.',
    screens: ['/portal/automacoes'],
  },
  B9: {
    code: 'B9',
    title: 'Segmentos inteligentes e ações em massa',
    clientMessage: 'Os segmentos inteligentes de leads e as ações em massa estão em implantação e serão liberados em breve.',
    screens: ['/portal/comercial/leads'],
  },
  B10: {
    code: 'B10',
    title: 'Período diário em Campanhas',
    clientMessage: 'A escolha de período com detalhe diário em campanhas está em implantação e será liberada em breve.',
    screens: ['/portal/marketing/campanhas'],
  },
  B11: {
    code: 'B11',
    title: 'Busca global do portal',
    clientMessage: 'A busca em todo o portal está em implantação e será liberada em breve.',
    screens: ['/portal'],
  },
  B12: {
    code: 'B12',
    title: 'Testar o agente de IA',
    clientMessage: 'O teste do agente de IA antes de publicar está em implantação e será liberado em breve.',
    screens: ['/portal/atendimento/agente-ia'],
  },
  B13: {
    code: 'B13',
    title: 'Variações e detalhes de criativos',
    clientMessage: 'A criação de variações e os detalhes dos criativos de campanha estão em implantação e serão liberados em breve.',
    screens: ['/portal/marketing/campanhas'],
  },
  B14: {
    code: 'B14',
    title: 'Envio de arquivos em Documentos',
    clientMessage: 'O envio de arquivos em Documentos está em implantação e será liberado em breve.',
    screens: ['/portal/projetos/documentos'],
  },
  B15: {
    code: 'B15',
    title: 'Lembrar de mim no login',
    clientMessage: 'A opção "Lembrar de mim" está em implantação e será liberada em breve.',
    screens: ['/login'],
  },
  B16: {
    code: 'B16',
    title: 'Perguntas sem resposta do agente de IA',
    clientMessage: 'A lista de perguntas que o agente não soube responder está em implantação e será liberada em breve.',
    screens: ['/portal/atendimento/agente-ia'],
  },
  B17: {
    code: 'B17',
    title: 'Pedir revisão de campanha',
    clientMessage: 'O pedido de revisão de campanhas pelo portal está em implantação e será liberado em breve.',
    screens: ['/portal/marketing/campanhas'],
  },
  B18: {
    code: 'B18',
    title: 'Duplicar, pausar e ativar campanha pelo portal',
    clientMessage: 'Duplicar, pausar e ativar campanhas pelo portal está em implantação e será liberado em breve.',
    screens: ['/portal/marketing/campanhas'],
  },
  B19: {
    code: 'B19',
    title: 'Importar, gerar variação e enviar conteúdo para campanha',
    clientMessage: 'Esta ação da Central de Conteúdo está em implantação e será liberada em breve.',
    screens: ['/portal/marketing/conteudo'],
  },
  B20: {
    code: 'B20',
    title: 'Concorrentes, pesquisa de mercado e geração a partir de inspirações',
    clientMessage: 'Esta ação de Criativos e Inspirações está em implantação e será liberada em breve.',
    screens: ['/portal/marketing/criativos'],
  },
  B21: {
    code: 'B21',
    title: 'Salvar título, texto e chamada do anúncio no rascunho',
    clientMessage: 'O salvamento dos textos do anúncio no rascunho está em implantação. Por enquanto, eles servem só para a prévia.',
    screens: ['/portal/marketing/campanhas'],
  },
  B22: {
    code: 'B22',
    title: 'Envio de teste do formulário externo',
    clientMessage: 'O envio de teste pelo portal está em implantação. Por enquanto, teste enviando o formulário do seu site.',
    screens: ['/portal/marketing/formularios'],
  },
  B23: {
    code: 'B23',
    title: 'Consultar o endereço de envio já gerado',
    clientMessage: 'A consulta do endereço de envio já gerado está em implantação. Por enquanto, gere um novo endereço se precisar do código.',
    screens: ['/portal/marketing/formularios'],
  },
  B24: {
    code: 'B24',
    title: 'Convidar pessoa por e-mail para o CRM',
    clientMessage: 'O convite de novas pessoas por e-mail está em implantação e será liberado em breve.',
    screens: ['/portal/empresa/usuarios'],
  },
  B25: {
    code: 'B25',
    title: 'Criar equipes comerciais pelo portal',
    clientMessage: 'A criação de equipes comerciais pelo portal está em implantação e será liberada em breve.',
    screens: ['/portal/empresa/usuarios'],
  },
  B26: {
    code: 'B26',
    title: 'Anexar arquivos nas conversas',
    clientMessage: 'O envio de anexos pelas conversas está em implantação e será liberado em breve.',
    screens: ['/portal/atendimento/conversas'],
  },
}

export const getPendingFeature = (code: PendingCode): PendingFeature => PENDING_FEATURES[code]

const codeNumber = (code: PendingCode) => Number(code.slice(1))

/** Lista ordenada por código (B1…B26); serve de checklist antes da liberação total. */
export const listPendingFeatures = (): PendingFeature[] =>
  Object.values(PENDING_FEATURES).sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
