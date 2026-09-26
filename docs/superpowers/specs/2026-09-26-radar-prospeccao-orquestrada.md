# Radar Comercial e prospecção orquestrada — especificação

**Data:** 26/09/2026

**Estado:** proposta para revisão; nenhuma fonte ou modelo pago autorizado por este documento.

## Objetivo

Transformar o Radar na descoberta inicial de uma jornada de prospecção configurável por organização: descobrir empresa → verificar identidade, site e contatos → diagnosticar oportunidade com evidências → registrar no CRM e avançar conforme regras do funil → preparar proposta → abordar pelo canal autorizado → qualificar com SDR → transferir responsabilidades por eventos do CRM → medir resultados. O Radar não substitui o CRM nem autoriza contato automaticamente.

## Diagnóstico do código atual

- Busca `jina_search` e `web_search` chama a mesma Jina Search; importação de URL usa Jina Reader. Essas dependências devem sair do caminho ativo, sem quebrar registros históricos.
- Busca web cria candidatos com URL e resumo; a análise posterior não lê automaticamente o conteúdo do site. Ausência de URL não prova ausência de site.
- CNPJa, CSV, cadastro manual, revisão, deduplicação, análise via Harness e conversão em lead já existem, mas Radar e prospecção exigem papel interno YUX. A navegação depende de `isInternalGrowthWorkspace`.
- A conversão escolhe o primeiro pipeline disponível, usa oferta padrão da YUX e pode preencher e-mail fictício `@yux.local`. Isso não é aceitável para roteamento SaaS ou comunicação.
- Prospecção atual exige plano, sequência, revisão legal, elegibilidade e aprovação; o envio é governado. WhatsApp nativo atende com IA, mas a escolha final do assistente de entrada não segue uma transição por estágio do CRM.
- O Admin já mantém roteamento de LLM por caso de uso, com modelo/fallback e teste; hoje conhece `chat` e `embedding`, não um modelo de decisão como Jev.

## Decisão arquitetural proposta

1. **Descoberta não é raciocínio.** Uma fonte de busca devolve candidatos com proveniência. O LLM, roteável no Admin, pode formular consultas e extrair fatos de páginas, mas não deve inventar empresas a partir de memória. O resultado de uma busca deve ser verificado antes de virar diagnóstico.
2. **Fontes substituíveis.** Desativar Jina para novas execuções e preservar dados antigos. Manter manual/CSV/CNPJa. Primeiro piloto automático: extrato OSM regional indexado localmente, sem chamada paga ou Overpass público para o SaaS; medir cobertura real antes de escalar. Depois, adicionar interface `RadarDiscoveryProvider` para fontes aprovadas no Admin, inclusive dados abertos do CNPJ e busca web quando seus direitos de persistência forem confirmados. Brave e Parallel são candidatos a comparar, não fontes aprovadas. Provedor não configurado ou sem permissão: falha fechada, sem fallback silencioso para Jina ou scraping de Google.
3. **Navegação serve para verificar o site.** Para URLs encontradas ou informadas, usar requisição HTTP limitada e extração do HTML; somente páginas que dependam de JavaScript vão para um worker Playwright isolado, com orçamento, timeout, bloqueio de rede privada e respeito a restrições do site. Playwright não será o mecanismo primário para raspar páginas de resultados de buscadores. Estados do site: `verified_present`, `not_found_in_checked_sources`, `unknown`, `blocked`; a ausência nunca é absoluta e erro/timeout não vira `not_found_in_checked_sources`.
4. **Modelos por função.** Criar no Admin rotas separadas `radar_query_planner`, `radar_site_analyst` e `radar_proposal_drafter`, com modelo/fallback/custo/teste no padrão existente. A fonte de pesquisa fica em Integrações/Radar, com chave e teto próprios. O modelo Jev é candidato opcional à rota de **decisão** `radar_candidate_triage`, não a busca ou extração: recebe fatos verificados e retorna elegibilidade/prioridade/revisão com confiança. Rota desativada até benchmark com dados brasileiros rotulados e autorização explícita para chamadas pagas.
5. **CRM é o orquestrador.** Cada organização configura CRM, pipeline e mapeamento de eventos/estágios por campanha. Não escolher primeiro pipeline implicitamente. Persistir a identidade e evidências do candidato sem contato fictício. Regras versionadas avançam apenas quando pré-condições são satisfeitas; cada efeito guarda correlação e idempotência. Radar e prospecting são módulos desligados por padrão, ativáveis por Admin por organização e sujeitos a contrato/papel.
6. **Contato é uma etapa distinta.** Análise e proposta podem ser preparadas sem disparo. A política do WhatsApp exige que o destinatário tenha fornecido o número e aceitado receber mensagens da empresa; para conversa iniciada pela empresa, exige também template aprovado. Número encontrado na web não atende a esses requisitos. Fora dessas condições, parar para revisão ou escolher outro caminho autorizado. SDR responde/qualifica e atualiza o CRM; uma mudança de estágio ou evento ativa o próximo perfil ou tarefa. Closer não assume porque o SDR “decidiu trocar” dentro do mesmo turno.

## Fluxo e estados desejados

`discovered → identity_review → website_check → evidence_review → fit_review → crm_ready → proposal_draft → proposal_approved → outreach_eligible → outreach_queued → conversation_active → qualified / disqualified → handoff / won / lost`

Cada organização pode renomear estágios de CRM e escolher quais passos são manuais, assistidos ou automáticos; os estados técnicos acima permanecem estáveis para auditoria. A regra nunca pula um bloqueio de fonte, permissão, aprovação ou elegibilidade. A transição para `outreach_queued` exige decisão registrada e verificação no momento do envio.

## Evidência mínima e qualidade

- Empresa: nome, região, fonte, horário de coleta, identificador/canonicalização e dedupe; CNPJ apenas quando conhecido e confirmado.
- Site: URL testada, URL final, resposta, título, trechos relevantes, data e motivo de `unknown`/`blocked`; contato descoberto deve ter página de origem.
- Diagnóstico: separar fato observado, hipótese e recomendação; apontar oferta disponível da organização e pelo menos uma evidência para cada afirmação sobre o site. Não gerar crítica de site não lido.
- Decisão de triagem: score, confiança, modelo/versão, limiar e motivo de escalonamento. Jev não escreve mensagem, diagnóstico ou proposta.
- CRM/contato: etapa anterior/nova, regra acionada, aprovação, permissão por canal, template/versão, id da tentativa, entrega, resposta e opt-out.

## Segurança, custo e liberação

Nenhuma fonte ou IA paga é ativada por migração. Admin deve conectar credencial, testar, aprovar custo/teto e habilitar explicitamente por organização. Custos por pesquisa, página, modelo e mensagem são separados. Exigir rate limit, fila, kill switch, limite diário e por campanha, reprocessamento idempotente, proteção contra SSRF e isolamento entre organizações. Conteúdo público continua sujeito a termos de uso, direitos de armazenamento e política de privacidade. Piloto começa em organização própria, sem envio externo automático; depois expande por canário e métricas.

## Critérios de aceite de ponta a ponta

1. Uma organização sem módulo Radar recebe 403 na API e não vê o menu; Admin pode ativar apenas para uma organização, sem liberar as demais.
2. Busca funciona sem Jina quando há fonte aprovada; sem fonte, UI explica bloqueio e não faz chamada externa.
3. Resultado de busca não é tratado como site auditado; URL que falhou fica `unknown`/`blocked` e não gera diagnóstico assertivo de defeitos.
4. Empresa com contato incompleto entra no CRM sem e-mail inventado, no pipeline explicitamente escolhido para a campanha, com proveniência preservada.
5. Proposta nasce de briefing/evidências e permanece rascunho até revisão; nenhuma proposta ou primeira mensagem é enviada porque um candidato foi descoberto.
6. Quando um contato elegível responde ao SDR, qualificação e mudança de etapa geram evento no CRM; a regra ativa o próximo agente/tarefa uma vez. Sem permissão, template ou conexão, o contato permanece bloqueado e auditável.
7. Falha de provedor, fallback de modelo, opt-out, reprocessamento e outra organização não provocam envio duplicado nem vazamento de dados.

## Pontos que exigem decisão antes do piloto pago

- Fonte de descoberta adicional com direito de persistência e orçamento: decidir após medir o piloto OSM e confirmar os termos de cada provedor; Brave, Parallel e CNPJa permanecem opcionais e desligados até decisão.
- Limiar de qualidade/precisão do Jev em português e custo do benchmark: só ativar após amostra rotulada e aprovação de uso pago.
- Política comercial do primeiro contato: a recomendação é **não anexar proposta automaticamente a abordagem fria**; preparar proposta e enviar apenas após permissão, contexto adequado e aprovação definidos por organização.

## Referências verificadas

- Código: `backend/src/modules/radar/`, `backend/src/modules/prospecting/`, `backend/src/modules/crm/`, `backend/src/modules/automations/`, `backend/src/modules/omnichannel/`, `backend/src/modules/platform/llm-routing.ts`, `frontend/src/lib/radar/radarRules.ts`.
- [Brave Search API e preço](https://brave.com/search/api/), [Brave Place Search](https://api-dashboard.search.brave.com/documentation/services/place-search) e [condições de armazenamento dos resultados](https://brave.com/search/api/).
- [TypeSafe: Jev e decisões estruturadas](https://docs.typesafe.ai/concepts/system-one), [Jev no OpenRouter](https://openrouter.ai/typesafe/jev-1.13).
- [Política de mensagens WhatsApp Business](https://business.whatsapp.com/policy/preview?lang=pt_BR).
