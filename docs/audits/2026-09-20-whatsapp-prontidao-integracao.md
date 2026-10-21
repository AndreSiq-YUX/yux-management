# WhatsApp — análise de prontidão da integração

Data: 20/09/2026. Etapa 1: conexão Meta, transporte de mensagens e pré-requisitos do primeiro atendimento.

## Conclusão

A integração ainda não está pronta. Existe uma base real de recebimento, persistência, filas, envio e chamada dos agentes, mas o cadastro oficial do WhatsApp está interrompido no backend e sem conclusão no frontend. Não basta cadastrar as credenciais da Meta.

Direção confirmada pelo usuário: começar com número de teste da Meta; produto SaaS com várias empresas e vários números por empresa. O número de teste deve pertencer a uma organização de homologação e percorrer a mesma estrutura de conexões usada pelos clientes.

O objetivo até 21/09 deve ser um piloto controlado que recebe texto e responde com um agente. A abertura do onboarding para clientes externos também depende das liberações da Meta e não pode ser prometida nesse prazo.

## Evidências e limites

- Código local analisado: commit `8f4563543154fe539ff5d77efd3eb545159b001b`.
- Consulta pública de produção: `GET https://hub.yux.com.br/api/health` retornou HTTP 200 e commit `43d32126a5c98242f3ae77167910fc1ed208aa29`.
- `GET https://hub.yux.com.br/api/webhooks/meta/channel-event` retornou HTTP 503, `webhook_not_configured`. O código local produz essa resposta quando falta `META_WEBHOOK_VERIFY_TOKEN`; confirmar o ambiente efetivamente publicado antes de concluir sobre outras variáveis.
- Produção e checkout anunciam commits diferentes. Os achados de código abaixo referem-se ao checkout; não houve inspeção autenticada do banco, dos segredos, do Dokploy ou dos workers de produção.
- 66 testes existentes passaram: 53 backend, 13 frontend. São testes locais com dependências simuladas, não uma homologação com a Meta.
- Não houve envio real de mensagem, criação de conta Meta, cadastro de número nem alteração de produção.
- Testes com Postgres/Redis reais não foram executados. A suíte exige serviços dedicados e controle do Redis; Docker não estava disponível no PATH desta sessão.
- Nenhum código funcional foi alterado nesta análise.

## O que já existe

| Componente | Evidência | Limite |
| --- | --- | --- |
| Conexões por empresa | `channel_connections.organization_id`, credenciais por conexão | Falta concluir provisionamento WhatsApp e identidade única do número |
| Autorização administrativa | `modules/functions/routes.ts`, sessão, papel e membership | Precisa de teste real com duas empresas e múltiplos números |
| Segredos criptografados | `providerSecrets.ts`, AES-GCM, referência no banco | Chave e credencial reais ainda não validadas |
| Webhook oficial | GET de verificação e POST com HMAC do corpo original | Endpoint publicado ainda responde 503 no GET |
| Persistência antes da fila | Evento de webhook e evento de domínio na mesma transação | Há falhas de normalização e deduplicação detalhadas abaixo |
| Transporte de saída | Cloud API para texto e template; token por conexão | Não homologado na Meta; políticas incompletas |
| Atendimento por IA | Chamada ao runtime, sugestão, aprovação e handoff | Modo automático inicial e seleção por número incompletos |
| Recuperação | Testes de evento duplicado e recuperação após Redis indisponível | Integração com infraestrutura real ainda não executada nesta análise |

O caminho ativo revisado usa Fastify, Postgres, eventos, BullMQ e runtime de agentes. Não exige n8n ou Evolution para a mensagem WhatsApp percorrer esse caminho. O README mistura planos antigos com a implementação atual.

## Achados prioritários

### W01 — Conclusão do cadastro WhatsApp bloqueada

**Bloqueia conectar pelo produto.** `backend/src/lib/meta-channel-oauth.ts:89` lança incondicionalmente `whatsapp_embedded_signup_completion_requires_signed_embedded_payload` quando o canal é WhatsApp. A função seguinte só seleciona ativos Instagram/Messenger. Não há conclusão funcional de cadastro do número WhatsApp nesse caminho.

Completar a troca de código no servidor, validar os ativos autorizados com a Meta, persistir WABA/número/credencial por organização e tornar reconexão e repetição seguras. O nome da exceção não prova que o payload do navegador seja uma assinatura confiável: os ativos devem ser confirmados no servidor.

### W02 — Retorno da autorização não está ligado ao frontend

**Bloqueia a jornada de conexão.** `PortalConnectedChannelsPage.tsx:78` navega para a Meta. `metaChannelService.completeConnect` existe, mas a busca no código ativo não encontrou consumidor; também não encontrou rota de retorno OAuth no `App.tsx`, `FB.login` ou tratamento de `WA_EMBEDDED_SIGNUP`.

Implementar o fluxo oficial atual de Embedded Signup, com sessão vinculada ao usuário/organização/canal, validação de origem dos eventos, cancelamento, expiração e conclusão. A URL construída hoje, por si só, não conclui o onboarding.

### W03 — Múltiplos números existem no modelo, mas não na gestão

**Bloqueia o requisito SaaS completo.** `ConnectedChannelsWorkspace.tsx:65` usa `channels.find(...)`, exibindo somente uma conexão por canal. O banco permite várias conexões, mas a interface oculta as adicionais e não oferece gestão individual de cada número.

Exibir todos os números; permitir adicionar, reconectar, testar e desativar cada um. Mostrar número legível, WABA, estado e agente/fila. Manter `connection_id` na conversa e nas mensagens para responder pelo número correto.

### W04 — Roteamento precisa garantir dono único do número

**Requisito antes de liberar clientes externos.** `modules/webhooks/routes.ts:64` busca globalmente `phone_number_id` ativo com `LIMIT 1`. As migrations revisadas não definem unicidade desse identificador; a unicidade existente é organização/canal/nome. Se o mesmo número entrar em duas organizações, a consulta pode escolher uma associação arbitrária.

Garantir uma associação ativa inequívoca por número no aplicativo; rejeitar conflito entre organizações e verificar propriedade/autorização na Meta. Validar coerência entre organização, conversa, contato e conexão em todo envio. `createHumanReply` aceita `connectionId` e o worker faz join por ID sem uma comparação explícita de organização nessa consulta; o alcance efetivo depende das policies do banco e exige teste de integração, não é vazamento comprovado nesta análise.

### W05 — Webhook perde itens de lotes

**Corrigir antes do piloto confiável.** `whatsappProvider.ts:74–111` seleciona apenas o primeiro `entry`, `change`, `message` e `status`. A rota e o consumidor chamam esse normalizador singular. Um POST com duas mensagens resulta no processamento apenas da primeira, embora receba HTTP 200.

Percorrer todos os itens, resolver conexão por item e persistir eventos independentes. Definir tratamento de item inválido sem descartar os demais.

### W06 — Confirmações de entrega colidem na deduplicação

**Corrigir antes de avaliar entrega.** `whatsappProvider.ts:118–130` usa o mesmo ID da mensagem com `message.updated` para sent/delivered/read. Como `channel_webhook_events.idempotency_key` é único, as mudanças seguintes podem ser descartadas como repetição.

Reprodução executada diretamente no normalizador: três estados diferentes produziram `number-a:message.updated:wamid.same`, somente uma chave distinta. Separar identidade do evento de identidade da mensagem e impedir regressão de estado em recibos fora de ordem.

### W07 — “Testar” e “Checar saúde” não comprovam integração

`meta-channel-oauth.ts:162–193` apenas carrega/descriptografa o token e verifica a validade registrada localmente. Não consulta a Meta, não verifica permissões, número, inscrição da WABA ou recebimento. `testMetaChannel` retorna `providerMessageSent: false`; a tela mostra “Teste registrado”.

Separar diagnóstico local, validação remota e teste real com destinatário explícito. Só considerar integração homologada após observar saída e retorno no telefone e no sistema.

### W08 — Novas conversas não herdam o modo automático

**Bloqueia o atendimento automático de novos contatos.** `jobs/handlers/omnichannel.ts:120` grava sempre `response_mode='assisted'`. A configuração `omnichannel_settings.default_response_mode` é salva pela API, mas não é usada nessa criação. O envio da IA exige `response_mode='automatic'` nas linhas 186–188.

Aplicar a configuração adequada da organização/conexão ao criar a conversa; preservar tomada de controle humano. Para o piloto: começar assistido e só depois habilitar automático na organização de testes.

### W09 — Janela de atendimento não é protegida em todos os envios

`jobs/handlers/omnichannel.ts:324–332` condiciona os bloqueios de janela/template a `source='crm_sequence'`. Respostas humanas e de IA não passam pela mesma regra. Além disso, a janela é calculada pela data local de criação, não pelo horário original do evento recebido: atraso/reprocessamento pode aparentar uma janela mais recente.

Centralizar política de texto/template para todas as origens, com horário do último contato real e erros úteis. Aprovação local de uma mensagem não equivale à aprovação de um template pela Meta.

### W10 — Botões/documentos e mídia não estão completos

O normalizador retorna `interactive`, `button` ou `document` literalmente como `contentType`; o CHECK de `messages.content_type`, na migration base linha 2548, não aceita esses valores. Reprodução de botão interativo retornou `interactive`. Nenhuma alteração desse CHECK foi encontrada nas migrations posteriores.

Áudio/imagem/vídeo têm tipos previstos, mas `attachments: []` é fixo: não há download/transcrição da mídia nesse caminho, e a IA pode receber apenas `[audio]`. Mapear tipos, preservar metadados e implementar obtenção de mídia. Até lá, limitar o piloto a texto e oferecer resposta/handoff explícito para conteúdo não suportado.

### W11 — Agente escolhido por empresa, não por número

`modules/omnichannel/assistant-context.ts:30–48` seleciona um assistente ativo da organização, priorizando SDR; não recebe `connectionId`. Vários números não terão agentes distintos por esse caminho.

Definir roteamento conexão → assistente/equipe/fila, com padrão da organização como fallback. Isso permite números comercial/suporte sem misturar a experiência. Não é necessário ter vários agentes para o primeiro teste, mas o vínculo deve ser previsto no desenho.

### W12 — Publicação/configuração e versão da API precisam ser fechadas

O compose prevê App ID/Secret, verify token e Embedded Signup na API; API e workers compartilham a chave de criptografia. Isso é estrutura de configuração, não prova de valores ativos. O GET público do webhook falhou e a versão publicada difere da local.

O envio e OAuth estão fixados em `v20.0`. Validar e parametrizar uma versão suportada antes da ativação. A página oficial de versões retornou 429 nesta consulta; não foi adotada uma data de descontinuação sem confirmação primária.

## Arquitetura de conclusão para o SaaS

Aplicativo Meta da YUX → autorização da empresa via Embedded Signup → WABA(s) autorizadas → uma conexão por número → conversas vinculadas à conexão → agente/equipe configurados.

- Credenciais da aplicação são da plataforma; tokens de autorização e ativos ficam escopados à empresa/conexão. Nunca usar o número de teste como remetente global de clientes.
- WABA e número são identificadores diferentes. O envio usa Phone Number ID; a inscrição de eventos é por WABA.
- Reconectar um número não cria uma segunda identidade ativa. Desconectar bloqueia novos envios pendentes e não derruba indevidamente outros números da mesma WABA.
- A sessão de onboarding deve ser de uso único e permanecer vinculada à organização correta mesmo se o usuário trocar de workspace.
- O teste de transporte com número Meta não comprova onboarding de empresa externa nem funcionamento com vários números. Esses são critérios separados.

## Preparação na Meta e no servidor

1. Criar/acessar o portfólio empresarial da YUX e a conta de desenvolvedor; criar o aplicativo da plataforma com o caso de uso WhatsApp.
2. Abrir a configuração de API do WhatsApp; obter número de teste, WABA ID e Phone Number ID. Adicionar e verificar o telefone que receberá os testes conforme o painel permitir.
3. Usar o token de desenvolvimento apenas na homologação inicial, com expiração conhecida. Preparar credenciais adequadas ao fluxo definitivo de autorização dos clientes.
4. Configurar no servidor `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` e a chave de criptografia já prevista, consistente entre API e workers. Token de acesso deve ser armazenado criptografado por conexão.
5. Registrar callback HTTPS `https://hub.yux.com.br/api/webhooks/meta/channel-event`; confirmar desafio GET, assinatura POST e inscrição no campo `messages`. Confirmar também a inscrição do aplicativo na WABA.
6. Para onboarding SaaS, configurar Facebook Login for Business/Embedded Signup, domínio e retorno compatíveis com a implementação final. O exemplo atual de env usa `https://hub.yux.com.br/oauth/meta/callback`, mas essa rota ainda precisa ser implementada se mantida.
7. Conferir Business Verification, acesso às permissões WhatsApp e exigências de App Review/Tech Provider no painel. Preparar política de privacidade, tratamento/exclusão de dados e demonstração real da jornada para a liberação externa.
8. Confirmar migrations, workers interactive/external/maintenance, Redis, runtime e modelo de IA com credencial válida. Conferir organização de teste e assistente ativo antes de habilitar resposta automática.

Não pedir que clientes copiem App Secret ou usem um token global da YUX. Não colocar tokens em documentação, chat ou frontend. Os IDs não substituem a autorização de acesso aos ativos.

As etapas de conta, ativos, token e inscrição seguem a [coleção oficial da Meta no Postman](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api). O desenho de onboarding usa como referência o [exemplo oficial de Tech Provider da Meta](https://github.com/fbsamples/business-messaging-sample-tech-provider-app/blob/main/README.md) e a [coleção oficial de Embedded Signup](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup). Consultadas em 20/09/2026; confirmar telas e exigências na conta efetiva.

## Ordem de execução e critérios de aceite

| Passo | Trabalho | Evidência para avançar |
| --- | --- | --- |
| 1 | Concluir onboarding e conexões por número | Cadastro/reconexão persistem organização, WABA, número e token corretamente |
| 2 | Corrigir lotes, recibos, tipos e modo inicial | Testes de regressão incluindo duas empresas e dois números na mesma empresa |
| 3 | Configurar Meta e servidor | Desafio validado, número acessível, WABA inscrita e workers disponíveis |
| 4 | Teste de transporte | Texto chega ao portal; resposta humana chega ao destinatário; recibos evoluem |
| 5 | Primeiro agente | Sugestão aprovada funciona; depois resposta automática em conversa nova |
| 6 | Resiliência mínima | Duplicação/reentrega não duplica resposta; falha aparece; humano assume e IA para |
| 7 | Piloto controlado | Texto homologado, equipe acompanha, forma de interromper automação verificada |
| 8 | Liberação SaaS | Empresa externa conclui onboarding autorizado; números e dados isolados |

Meta de amanhã: passos 1–7 no escopo mínimo de texto, condicionados à configuração real e à resolução dos bloqueios. Passo 8 depende também da Meta. Não confundir uma demonstração com número de teste com disponibilidade comercial irrestrita.

## Etapa 2 — auditoria do atendimento completo

Depois do transporte comprovado: memória e ordenação de mensagens, rajadas do mesmo contato, escolha de agente, base de conhecimento, alucinações, orçamento/latência, qualificação e CRM, regras de handoff, pausa após intervenção humana, retomada, agenda, follow-ups/templates, mídias, opt-out, reenvio após timeout e monitoramento operacional.

Já existe um ponto para investigar nessa etapa: o handoff disparado pelo worker altera `status` para `waiting_human`, mas não muda `response_mode`; o endpoint de handoff humano muda ambos. Verificar se a política do runtime impede nova resposta automática na próxima mensagem. Ainda não foi validado ponta a ponta.

## Testes executados

- Backend: `webhook-routes`, `whatsappProvider`, `metaChannel`, `omnichannel-routes`, `omnichannel-ai-loop`, `omnichannel`: 45/45.
- Backend: `function-routes`, `provider-secret-key`: 8/8.
- Frontend: `metaChannelService`, `metaChannelRules`, `ConnectedChannelsWorkspace`: 13/13.
- Reprodução direta, sem rede ou banco: colisão de três recibos em uma chave, lote retornando só a primeira mensagem e botão normalizado como tipo incompatível com o CHECK SQL.
- Consultas GET públicas: saúde HTTP 200; webhook HTTP 503.

Faltam testes de aceitação para os achados e execução com banco/Redis reais. Os testes atuais aprovados não são evidência de que o cadastro Meta ou a automação estejam concluídos.
