# WhatsApp SaaS — Plano de implementação e ativação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concluir a integração oficial WhatsApp para várias empresas e vários números por empresa, iniciando a homologação com número de teste da Meta e chegando a atendimento automático controlado.

**Architecture:** Um aplicativo Meta da YUX recebe autorizações dos clientes por Embedded Signup. Cada número tem uma conexão vinculada à organização, com credencial protegida, agente e conversas próprios. O webhook persiste eventos antes do processamento assíncrono; todo envio resolve a conexão da conversa e aplica a mesma política de entrega.

**Tech Stack:** React/TypeScript/Vite; Fastify/TypeScript; PostgreSQL; Redis/BullMQ; runtime Python dos agentes; WhatsApp Cloud API; Dokploy.

**Spec:** [Análise de prontidão de 20/09/2026](../../audits/2026-09-20-whatsapp-prontidao-integracao.md). Este plano incorpora a decisão do usuário de testar primeiro com número Meta e oferecer múltiplos números por cliente.

## Restrições globais

- “começar com número de teste da Meta; produto SaaS com várias empresas e vários números por empresa.”
- “Nunca usar o número de teste como remetente global de clientes.”
- “O teste de transporte com número Meta não comprova onboarding de empresa externa nem funcionamento com vários números.”
- Piloto inicial: texto, organização de homologação, destinatário de teste definido pelo usuário, modo assistido antes de automático.
- Não gravar tokens no chat, frontend, logs, fixtures ou documentação; persistir criptografados por conexão.
- Preservar alterações existentes do usuário e a compatibilidade dos outros canais Meta.
- Não aplicar migrations em produção antes de verificar duplicidades, versão publicada, backup e resultado em banco de teste.
- A implementação será iniciada em uma etapa posterior; este documento não autoriza por si só envios, publicação ou criação de contas.

## Marcos e ordem

| Ordem | Entrega | Responsável | Dependência | Critério de saída |
| --- | --- | --- | --- | --- |
| 0 | Preparar ambiente de execução e homologação | IA | Nenhuma | Versões identificadas, banco/Redis de teste disponíveis |
| 1 | Criar aplicativo Meta e obter número de teste | Usuário com orientação da IA | Pode começar junto da etapa 0 | App, WABA, Phone Number ID e destinatário disponíveis |
| 2 | Conexões por empresa/número e isolamento | IA | 0 | Duas empresas e dois números na mesma empresa passam nos testes |
| 3 | Concluir Embedded Signup e cadastro da conexão | IA + usuário na configuração Meta | 2; configuração real depende de 1 | Conexão autorizada persiste corretamente, sem duplicação |
| 4 | Gerenciar todos os números no portal | IA | 2–3 | Cada número aparece e pode ser administrado separadamente |
| 5 | Corrigir recebimento, recibos e envio | IA | 2 | Lotes, reentrega, janela e desativação passam nos testes |
| 6 | Diagnóstico remoto, publicação e teste de transporte | IA + usuário | 1–5 | Mensagem entra; resposta humana sai; recibos evoluem |
| 7 | Ativar agente e transferência para humano | IA + usuário | 6 | Sugestão aprovada e depois resposta automática comprovadas |
| 8 | Auditar fluxo completo e operar piloto | IA + usuário | 7 | Casos de atendimento aprovados e interrupção verificada |
| 9 | Liberar onboarding de clientes externos | IA + usuário + Meta | 3–8 e liberações da Meta | Empresa externa conecta seus números com isolamento comprovado |

Etapas 1 e 0–5 podem avançar em paralelo entre usuário e IA. Dentro do código, manter a ordem acima para facilitar diagnóstico; isso não pressupõe delegação a outros agentes.

**Marco A:** etapa 6 comprova integração de transporte. **Marco B:** etapas 7–8 comprovam piloto de atendimento. **Marco C:** etapa 9 comprova disponibilidade SaaS para clientes externos. Objetivo até 21/09: perseguir o Marco B; não prometer aprovação da Meta nessa data.

## Review Focus

1. Usuário troca de organização durante o cadastro: conclusão permanece vinculada à organização original e exige acesso atual — tarefa 3.
2. Duas mensagens do mesmo contato chegam juntas: não criar conversas/respostas duplicadas — tarefa 5.
3. Número é desconectado com envio pendente: worker bloqueia envio ao executar — tarefa 5.
4. Meta aceita envio e a conexão cai antes da resposta: resultado ambíguo não dispara reenvio cego — tarefa 5.
5. Humano assume enquanto a IA está gerando: rascunho pode ser preservado, mas envio automático não ocorre — tarefa 7.

## Mapa dos arquivos

| Área | Arquivos existentes a alterar | Arquivos propostos |
| --- | --- | --- |
| Configuração | `backend/src/config/env.ts`, `backend/.env.example`, `docker-compose.dokploy.yml` | — |
| Modelo | Migrations novas, sem reescrever a base `0100` | `backend/src/db/migrations/0174_whatsapp_saas_connections.sql` |
| Conexão | `backend/src/lib/meta-channel-oauth.ts`, `backend/src/modules/functions/routes.ts` | `backend/src/modules/omnichannel/whatsapp-connections.ts`, `backend/src/lib/whatsapp-graph.ts` |
| Portal | `frontend/src/services/metaChannelService.ts`, `frontend/src/pages/client-portal/PortalConnectedChannelsPage.tsx`, `frontend/src/components/omnichannel/ConnectedChannelsWorkspace.tsx`, `ConnectedChannelCard.tsx` no mesmo diretório | `frontend/src/lib/meta/whatsappEmbeddedSignup.ts` |
| Transporte | `backend/src/lib/edge-compat/whatsappProvider.ts`, `backend/src/modules/webhooks/routes.ts`, `backend/src/jobs/handlers/omnichannel.ts`, `backend/src/modules/omnichannel/repository.ts`, `backend/src/jobs/registry.ts` | `backend/src/modules/omnichannel/whatsapp-dispatch-policy.ts` |
| Agentes | `backend/src/modules/omnichannel/assistant-context.ts`, `backend/src/jobs/handlers/omnichannel.ts` | — |
| Testes | Suítes já citadas na análise | `backend/tests/whatsapp-connections.test.ts`, `backend/tests/whatsapp-dispatch-policy.test.ts`, `backend/tests/integration/whatsapp-saas.test.ts`, `frontend/src/lib/meta/whatsappEmbeddedSignup.test.ts` |
| Operação | `docs/omnichannel-ai-operations.md` | `docs/audits/2026-09-20-whatsapp-homologacao.md` |

Confirmar se `0174` continua disponível no início da implementação; se ocupado, usar o próximo número livre. Caminhos acima são relativos à raiz do repositório. Não dividir arquivos existentes além do necessário para separar conexão remota e política de envio.

## Tarefa 0 — Preparar execução e evidências

**Responsável:** IA. **Entrega:** ambiente de teste utilizável e versão candidata identificada. **Achado:** W12.

- [x] Comparar commit local com o publicado e registrar qual será a base da implementação; preservar arquivos não relacionados. Base local candidata: `8f4563543154fe539ff5d77efd3eb545159b001b`; produção consultada: `43d32126a5c98242f3ae77167910fc1ed208aa29`.
- [ ] Preparar Postgres/Redis dedicados à suíte de integração, sem apontar testes destrutivos para produção. Conferir `backend/tests/integration/support/rig.ts`.
- [x] Reexecutar os testes da análise para registrar a linha de base; resultado: 66 aprovados (53 backend e 13 frontend).
- [x] Criar o registro de homologação com campos: caso, horário, versão, organização, conexão, resultado esperado/obtido e evidência sem segredos.
- [x] Confirmar na documentação oficial a versão suportada da Graph API e o fluxo atual de Embedded Signup antes de codificá-los; a documentação lista `v26.0`, mas o painel Meta usado na homologação gerou e validou chamadas em `v25.0`.
- [x] Confirmar no painel da Meta a versão efetivamente aceita pela configuração do aplicativo após a criação do app: o teste gerado pelo painel usou `v25.0`.

**Atualização em 25/09/2026:** Postgres 17 foi inicializado em diretório temporário e isolado na porta `55432`. O Redis instalado no Windows é `3.0.504`; o BullMQ do projeto exige `5.0.0` ou superior, então a suíte que usa filas reais continua pendente. Os testes de banco da tarefa 2 puderam rodar com Postgres real usando uma fila fail-fast que não aceita jobs; aguardando decisão sobre instalar Redis compatível para completar a suíte.

Comandos de referência, executados no diretório correspondente:

```powershell
# backend
npm test -- tests/webhook-routes.test.ts tests/edge-compat/whatsappProvider.test.ts tests/edge-compat/metaChannel.test.ts tests/omnichannel-routes.test.ts tests/omnichannel-ai-loop.test.ts tests/edge-compat/omnichannel.test.ts tests/function-routes.test.ts tests/provider-secret-key.test.ts
# frontend
npm test -- src/services/metaChannelService.test.ts src/lib/meta/metaChannelRules.test.ts src/components/omnichannel/ConnectedChannelsWorkspace.test.tsx
```

## Tarefa 1 — Preparar Meta desde o início

**Responsável:** usuário, acompanhado pela IA. **Entrega:** ativos de teste disponíveis; nenhuma mensagem enviada nesta tarefa.

**Progresso em 25/09/2026:** aplicativo Meta criado como `Independent Tech Provider`; número de teste e envio inicial pelo painel confirmados. A verificação da empresa está aprovada. O envio da documentação de App Review está em análise, e o painel ainda mostra requisitos de configurações e gravações de evidência. O token temporário apareceu legível em captura compartilhada e deve ser regenerado antes de uso posterior.

**Conferência adicional em 25/09/2026:** a documentação oficial atual de Embedded Signup cita Advanced Access para `business_management` e `whatsapp_business_management` antes do lançamento. Conferir em “Permissões e recursos” se `business_management` também está solicitado/aprovado; o painel mostrado até aqui detalha os requisitos de vídeo das duas permissões WhatsApp.

- [x] Criar/acessar portfólio empresarial YUX e conta de desenvolvedor; criar aplicativo com caso de uso WhatsApp.
- [x] Obter número de teste, WABA ID e Phone Number ID; adicionar e verificar o telefone destinatário dos testes conforme o painel.
- [ ] Registrar expiração do token de desenvolvimento e armazená-lo pelo mecanismo protegido preparado na tarefa 2, quando disponível.
- [x] Identificar já no painel requisitos pendentes de empresa, Tech Provider, permissões e App Review; iniciar preparação documental enquanto o código avança. A empresa está aprovada; App Review ainda em análise, com evidências de vídeo/configurações por concluir.
- [ ] Configurar Facebook Login for Business/Embedded Signup e domínios conforme o fluxo confirmado na tarefa 0; manter callback OAuth distinto do webhook de mensagens.
- [ ] Disponibilizar App ID e configurações públicas para implementação; inserir App Secret/token somente em campos protegidos do servidor.

**Aceite:** IDs e destino de teste conhecidos; nenhuma dependência de um número pessoal/real para iniciar a homologação. A posse do número de teste não encerra a verificação do onboarding SaaS.

## Tarefa 2 — Conexão por número e proteção entre empresas

**Arquivos:** migration proposta, `whatsapp-connections.ts`, `repository.ts`; testes `whatsapp-connections.test.ts` e `integration/whatsapp-saas.test.ts`. **Achados:** W03, W04, W11.

**Progresso em 25/09/2026:** a base de persistência, o preflight do índice, a validação dos vínculos por organização, a política RLS dos segredos e a rejeição de `connectionId` divergente já foram implementados. O envio assíncrono também verifica vínculo mensagem/conversa e organização/canal. Os dois testes de integração passaram contra Postgres 17 isolado, com roles reais, usando fila fail-fast para esses cenários sem jobs; os testes de unidade direcionados (23) e type-check também passaram. A primeira execução real revelou e permitiu corrigir a inferência de tipo de um parâmetro SQL. A execução que requer Redis real aguarda serviço compatível (o Redis instalado é 3.0.504). O painel Meta confirma a empresa aprovada e a análise do app em andamento; onboarding e integração de produção continuam pendentes.

**Contrato proposto para persistência após validação remota:**

```ts
type VerifiedWhatsAppConnection = {
  organizationId: string; userId: string; wabaId: string;
  phoneNumberId: string; displayPhoneNumber: string;
  accessToken: string; expiresAt: string | null;
};
type WhatsAppConnectionResult = {
  id: string; organizationId: string; phoneNumberId: string;
  state: 'pending' | 'connected';
};
// upsertVerifiedWhatsAppConnection(pool, input): Promise<WhatsAppConnectionResult>
// Token só entra por código de servidor após validação remota; não é resposta pública.
```

- [x] Escrever casos com empresa A/números A1+A2 e empresa B/número B1: listar somente os próprios; responder pela conexão da conversa; rejeitar conexão de outra empresa; reconectar A1 sem duplicá-lo.
- [x] Executar os casos de integração com roles reais; registrar a falha de inferência de tipo SQL encontrada e corrigi-la.
- [x] Na migration, adicionar vínculo opcional de assistente/equipe/fila e override de modo por conexão; validar pertencimento desses vínculos à mesma organização no servidor. Manter o modo da organização como fallback.
- [x] Verificar dados existentes antes do índice; em conflito, interromper a migração com diagnóstico, sem escolher um dono automaticamente.

```sql
CREATE UNIQUE INDEX channel_connections_active_whatsapp_phone_unique
ON public.channel_connections (phone_number_id)
WHERE channel = 'whatsapp' AND is_active = TRUE AND phone_number_id IS NOT NULL;
```

- [x] Persistir conexão e referência criptografada em transação; usar identidade do número, não nome de exibição, na reconexão.
- [x] Resolver destinatário/organização/conexão no servidor; rejeitar `connectionId` diferente do da conversa no envio humano e validar o vínculo no worker antes do envio.
- [x] Testar tentativa simultânea de associar o mesmo número a empresas diferentes; somente uma associação deve ser aceita.
- [x] Executar os casos de isolamento com roles reais em Postgres de teste isolado.
- [x] Revisar diff completo e registrar commit da entrega (`faf85f5`, conexão por empresa/número).

## Tarefa 3 — Concluir onboarding oficial e permitir homologação inicial

**Arquivos:** `meta-channel-oauth.ts`, `whatsapp-graph.ts`, rotas de functions, configuração e novo helper frontend; testes de conexão e helper. **Achados:** W01, W02, W12.

**Interfaces:** manter `start-meta-channel-connect` e `complete-meta-channel-connect`; estender conclusão WhatsApp com `{ organizationId, channel: 'whatsapp', state, code, wabaId, phoneNumberIds: string[] }`. IDs vindos do navegador são candidatos; só a consulta remota autoriza sua persistência. Resposta: `{ channel: 'whatsapp', connections: WhatsAppConnectionResult[] }`.

- [x] Testar state expirado, reutilizado, usuário incorreto, troca de workspace e número não autorizado; nenhum caso deve criar conexão.
- [x] Testar callback/evento de origem não autorizada, cancelamento e expiração no frontend; não mostrar sucesso nessas situações.
- [x] Implementar lançamento e retorno pelo mecanismo oficial confirmado, correlacionando código e ativos à sessão original. Validar origem exata de eventos do navegador; não aceitar sufixos de domínio genéricos.
- [x] Trocar código por token no servidor, verificar acesso à WABA e aos números, inscrever o aplicativo na WABA e registrar número quando exigido pelo fluxo efetivo.
- [x] Consumir state atomicamente; em falha parcial, manter estado pendente com etapa recuperável. Retentativa deve verificar o estado remoto antes de repetir operações; chamadas à Graph API têm timeout e processing ativo não é tomado por outra tentativa.
- [x] Usar a persistência da tarefa 2 e só marcar conectado após validações remotas; nunca confiar apenas no payload da janela Meta.
- [x] Introduzir `META_GRAPH_VERSION`, validada no backend e repassada ao frontend e workers; remover o uso fixo de `v20.0` no caminho WhatsApp. Não escolher versão por memória.
- [x] Para o número de teste, se o painel não permitir sua seleção no Embedded Signup, oferecer provisionamento **restrito a administrador interno** com WABA/Phone Number ID/token de teste, usando as mesmas validações remotas e persistência. Esse acesso deve ficar limitado à organização de homologação e nunca substituir o onboarding dos clientes.
- [x] Executar testes direcionados de funções/segredos/conexão; conferir que respostas e payloads persistidos não contêm tokens em claro.
- [ ] Revisar diff final completo e registrar commit da entrega.

**Progresso em 25/09/2026:** fluxo Embedded Signup e persistência do WhatsApp estão implementados localmente na branch `codex/whatsapp-saas-task2`, com validação remota dos ativos, troca de código no servidor, credencial temporariamente cifrada para recuperação, proteção contra repetição concorrente e `META_GRAPH_VERSION` chegando também aos workers de envio. Passaram type-check do backend/frontend, 29 testes unitários direcionados, 3 testes de integração no Postgres isolado, 13 testes do frontend e build do frontend. Revisão final e commit desta tarefa ainda pendentes; provisionamento administrativo do número de teste só será implementado se a seleção via Embedded Signup não for possível. Não houve migration fora do banco temporário nem envio/publicação em produção.

**Aceite:** onboarding do produto implementado e coberto por testes; conexão do número de teste pode ser provisionada sem alterar o modelo SaaS. Homologação real do Embedded Signup permanece exigida no Marco C.

## Tarefa 4 — Gestão de todos os números no portal

**Arquivos:** página, workspace, card e serviço Meta do mapa; testes existentes de página/workspace/serviço. **Achados:** W03, W07, W11.

- [x] Adicionar teste de renderização com dois números WhatsApp e um canal diferente: ambos os números e suas ações devem aparecer; testar vazio e permissão somente leitura.
- [x] Substituir seleção singular por lista de conexões; deixar “Adicionar número” separado das ações de cada conexão.
- [x] Mostrar número legível, nome, estado, agente e última verificação; permitir configuração individual dos vínculos da tarefa 2.
- [x] Implementar reconexão/desconexão por ID, estados pendentes e erros visíveis. A reconexão é vinculada no estado OAuth ao ID escolhido e a Meta precisa devolver exatamente aquele Phone Number ID; desconectar um número não retira os demais da tela nem desinscreve a WABA.
- [x] Manter “Verificar credencial” enquanto a checagem for local e “Enviar mensagem de teste” via envio normal com rastreio; só exigir o destinatário explicitamente e não enviar até confirmação.
- [x] Testar reconexão de A1 preservando A2 e as configurações por número; verificar a tela renderizada em largura desktop e celular.
- [ ] Rodar testes direcionados, revisar diff e registrar commit.

**Progresso em 25/09/2026:** a tela lista conexões independentes, adiciona novos números separadamente, edita agente/equipe/fila/modo por conexão e mostra estados pendentes/erros. A reconexão selecionada é vinculada no servidor ao mesmo ID e rejeita um número diferente; teste também confirma que não duplica a conexão nem apaga configurações ao reconectar. O botão está rotulado com precisão como “Verificar credencial”: hoje a verificação é local, e a checagem remota será concluída na tarefa 6. O botão de mensagem de teste segue pendente porque a implementação atual `send-meta-channel-test` não envia mensagem. Só será habilitado depois que a tarefa 5 permitir usar o fluxo normal de saída com destinatário explícito. A visualização local com fixture de 2 números + Instagram passou em 1440px e 390px, sem overflow horizontal; nenhuma chamada à Meta foi feita.

## Tarefa 5 — Transporte íntegro de mensagens

**Arquivos:** provider, webhook, worker, repository, registry e política de envio do mapa; testes webhook/provider, nova política e integração. **Achados:** W05, W06, W09, W10.

**Contrato de normalização proposto:** `normalizeWhatsAppBatch(payload: unknown): { events: NormalizedWhatsAppInboundEvent[]; rejected: Array<{ index: string; reason: string }> }`, reutilizando o tipo exportado de `whatsappProvider.ts`. Cada evento deve guardar payload individual recuperável, horário original, Phone Number ID e identidade própria. A rota resolve conexão e chave final por evento, sem usar conexão única para o lote.

- [x] Criar e executar testes de duas entries, dois changes, duas mensagens, recibos diferentes, evento repetido e item inválido misturado a válidos.
- [x] Implementar normalizador plural; persistir todos os itens válidos com outbox transacional. Registrar motivos sanitizados dos rejeitados.
- [x] Diferenciar chave de mensagem da chave de recibo; considerar estado e timestamp no recibo. Aplicar evolução sent → delivered → read sem regressão por ordem de chegada; preservar falhas como eventos diagnosticáveis.

Exemplo de regressão executável a incluir no teste do provider:

```ts
it('preserva as três confirmações da mesma mensagem', () => {
  const payload = { entry: [{ id: 'waba-a', changes: [{ value: {
    metadata: { phone_number_id: 'number-a' },
    statuses: ['sent', 'delivered', 'read'].map((status, i) => ({
      id: 'wamid.same', recipient_id: '5511999990000',
      timestamp: String(1789910000 + i), status,
    })),
  } }] }] };
  const { events } = normalizeWhatsAppBatch(payload);
  expect(events).toHaveLength(3);
  expect(new Set(events.map(event => event.idempotencyKey)).size).toBe(3);
});
```

- [x] Serializar criação/processamento por contato/conexão ou usar proteção transacional equivalente; testar rajada concorrente sem duplicar conversa nem resposta.
- [x] Mapear `interactive`/`button` para texto com metadados originais e `document` para arquivo. Para mídia não interpretada no piloto, registrar e encaminhar ao humano; não enviar `[audio]` ao modelo como se fosse o conteúdo.
- [x] Aplicar política comum a humano, IA e automação: conexão ativa, vínculo correto, janela baseada no timestamp original do contato, template válido fora da janela e regras de permissão aplicáveis à finalidade do envio.
- [x] Revalidar conexão ativa no momento do envio, incluindo mensagem que já estava na fila quando houve desconexão.
- [x] Distinguir falha conclusiva de resultado ambíguo após timeout. Bloquear repetição automática de resultado ambíguo até reconciliação; um cabeçalho interno não garante idempotência na Meta.
- [x] Executar integração com banco/Redis reais: reentrega, recuperação após indisponibilidade, reinício do worker e falha posterior à aceitação remota simulada.
- [x] Rodar testes direcionados, suíte completa e type-check de backend.
- [ ] Revisar diff final completo e registrar commit.

**Progresso em 25/09/2026:** recebimento em lote, recibos fora de ordem, concorrência por contato/número, tratamento de mídia e política comum de envio estão implementados. Foram aprovados 737 testes do backend, 596 do frontend, type-check do backend, build do frontend, lint dos arquivos WhatsApp alterados e 4 testes de integração contra Postgres 17 isolado. A integração adicional comprova que recibos ainda são aplicados após desconectar o número, enquanto novas mensagens são ignoradas; o manifesto de migrations foi atualizado e validado. A suíte de integração usou fila stub: o Redis local é 3.0.504 (BullMQ exige 5+) e Docker não está disponível, então reentrega/recuperação com Redis real e reinício de worker permanecem pendentes. O lint global ainda reporta erros fora dos arquivos WhatsApp alterados. Não houve chamada à Meta, envio real, migration em produção ou publicação. Revisão final e commit ficam pendentes até concluir a verificação com Redis compatível.

## Tarefa 6 — Diagnóstico remoto, publicação e Marco A

**Arquivos:** diagnóstico em `meta-channel-oauth.ts`/`whatsapp-graph.ts`, compose/env, documentação operacional e registro de homologação. **Achados:** W07, W12.

- [x] Testar token local válido, mas revogado remotamente: diagnóstico não pode retornar conectado. Testar permissão ausente, número não acessível e WABA sem inscrição.
- [x] Retornar verificações separadas de credencial, acesso ao número e inscrição; marcar envio/retorno real como ainda não comprovados até o teste correspondente.
- [ ] Rodar testes de integração, type-check dos dois projetos e build do frontend candidato; corrigir falhas relacionadas antes de publicar.
- [ ] Preparar release identificada, migrations verificadas e reversão por desativação do canal/retorno da aplicação; publicar quando a execução tiver autorização correspondente.
- [ ] Inserir configuração Meta no servidor; conferir mesma chave de segredos na API e nos workers e disponibilidade do runtime/modelo.
- [ ] Configurar callback HTTPS `https://hub.yux.com.br/api/webhooks/meta/channel-event`, verify token e campo `messages`; confirmar inscrição da WABA.
- [ ] Realizar GET de desafio e POST assinado de teste; assinatura inválida deve ser recusada. Conferir persistência e consumo na fila.
- [ ] Com destinatário explicitamente definido, enviar a primeira mensagem de teste permitida pela Meta; conferir no celular. Responder pelo celular e confirmar a conversa no portal.
- [ ] Responder manualmente pelo portal; conferir remetente correto e evolução dos recibos disponíveis. Falta de recibo de leitura pode depender da configuração do destinatário; não confundir com falha de envio.
- [ ] Registrar versão, IDs de eventos/mensagens e resultado; nenhum token no relatório.

**Marco A aprovado:** entrada e resposta humana comprovadas no canal real. A partir daqui começa a validação do atendimento.

**Atualização em 21/10/2026:** preparação local com PostgreSQL/Redis reais concluída (9 testes de integração em 5 arquivos); backend 777 testes e frontend 618 testes aprovados. Revisão independente e correções verificadas. Provisionamento interno, envio de teste pelo fluxo normal e diagnóstico remoto implementados. Interface verificada no navegador desktop/celular, com provedor simulado. Preparação da candidata sobre main atual em checkout separado; ainda sem configuração, migration ou publicação em produção e sem mensagem real pelo YUX. Os checks de commit/publicação permanecem pendentes até a candidata integrada ser verificada. Evidências e dependências no registro de homologação.

## Tarefa 7 — Primeiro agente, modo automático e controle humano

**Arquivos:** `assistant-context.ts`, worker omnichannel, configuração por conexão e testes `omnichannel-ai-loop.test.ts`/integração. **Achados:** W08, W11 e handoff da etapa 2 da análise.

**Interface:** estender `resolveOmnichannelAssistantContext(pool, organizationId, connectionId)` para resolver assistente da conexão, com fallback explícito da organização. Validar os vínculos na leitura e na gravação.

- [ ] Testar conversas novas herdando modo da conexão e depois da organização; manual não chama IA, assistido não envia, automático depende também da política do agente.
- [ ] Testar A1 com agente comercial e A2 com agente de suporte sem mistura de configuração ou histórico.
- [ ] Corrigir criação de conversa para usar o modo resolvido. Não alterar retroativamente conversa tomada por humano.
- [ ] Unificar handoff de sistema/humano: interromper envio automático; revalidar modo e atribuição depois da geração e imediatamente antes do envio.
- [ ] Testar humano assumindo durante geração, IA indisponível e conteúdo fora do escopo; tornar a pendência visível sem prometer resposta que não foi enviada.
- [ ] Configurar um assistente com conhecimento mínimo da YUX, limites de atuação e encaminhamento humano.
- [ ] No WhatsApp real, validar sugestão assistida e aprovação; depois habilitar automático somente na conexão/organização de homologação e testar conversa nova.
- [ ] Verificar parada manual e retomada explícita; registrar evidências e commit das mudanças.

## Tarefa 8 — Auditoria do fluxo e Marco B

**Responsável:** IA conduz casos; usuário avalia conteúdo e confirma comportamento no celular. **Entrega:** matriz preenchida, correções críticas verificadas e piloto acompanhado.

| Caso | Comportamento exigido |
| --- | --- |
| Saudação e pergunta institucional | Resposta coerente com conhecimento aprovado |
| Pergunta sobre preço/condição não cadastrada | Não inventar; pedir informação ou encaminhar |
| Pedido de humano | Parar automação e tornar pendência visível |
| Mensagens rápidas em sequência | Preservar contexto sem responder repetidamente ao mesmo evento |
| Novo contato e conversa retomada | Aplicar modo e histórico corretos |
| Falha do modelo/worker/Meta | Falha identificável e recuperação sem reenvio cego |
| Áudio/imagem/documento no piloto de texto | Preservar evento e encaminhar, sem fingir compreensão |
| Duas empresas e vários números | Não misturar credenciais, histórico, agente ou remetente |
| Qualificação e CRM ativados | Dados e próxima ação correspondem ao diálogo |
| Automação pausada | Nenhum envio automático novo, inclusive de geração pendente |

- [ ] Executar casos simulados que seriam impraticáveis no número de teste; separar claramente evidência simulada da real.
- [ ] Corrigir todo bloqueio de perda de mensagem, envio duplicado, mistura entre empresas ou desrespeito ao controle humano antes de aceitar o piloto.
- [ ] Registrar limitações de mídia, agenda, follow-up e templates; manter desativadas funções que ainda não passaram em seus casos.
- [ ] Verificar métricas mínimas: eventos falhos, idade da fila, falha de envio, disponibilidade do agente e expiração da credencial.
- [ ] Encerrar o marco com responsável humano acompanhando e procedimento de pausa testado.

**Marco B aprovado:** atendimento por texto funciona com número de teste, sem falhas críticas abertas. Mídia avançada, agenda e campanhas terão tarefas próprias se forem necessárias; sua ausência não deve ficar disfarçada como integração concluída.

## Tarefa 9 — Onboarding de clientes e Marco C

**Responsável:** usuário/IA nos ajustes; Meta nas liberações externas. **Entrega:** jornada SaaS homologada.

- [ ] Conferir exigências efetivas no painel e concluir verificações/permissões/revisão aplicáveis; usar a demonstração funcional obtida nas tarefas anteriores.
- [ ] Homologar Embedded Signup com uma empresa autorizada externa ao ambiente de desenvolvimento, usando seus próprios ativos.
- [ ] Conectar dois números dessa empresa; associar agente/equipe e receber/responder por cada um.
- [ ] Repetir com outra empresa e conferir isolamento também no banco/roles, não só na tela.
- [ ] Testar cancelamento, reconexão, revogação de acesso, expiração e desconexão de um número sem afetar os demais.
- [ ] Confirmar credenciais adequadas à operação contínua; o token temporário de desenvolvimento não é o mecanismo de produção.
- [ ] Publicar documentação para administradores clientes e liberar o recurso progressivamente após os critérios anteriores.

**Marco C aprovado:** um novo cliente consegue conectar e operar os próprios números pela jornada do produto, com permissões e isolamento comprovados. Só então declarar o onboarding SaaS concluído.

## Cobertura da análise e registro de execução

| Achado | Tarefa |
| --- | --- |
| W01/W02 — conclusão e retorno Meta | 3 |
| W03 — múltiplos números | 2, 4, 9 |
| W04 — dono do número/isolamento | 2, 5, 9 |
| W05/W06 — lotes/recibos | 5 |
| W07 — diagnóstico/teste real | 4, 6 |
| W08 — modo inicial | 7 |
| W09 — janela/política de envio | 5 |
| W10 — tipos/mídia | 5, 8 |
| W11 — agente por conexão | 2, 4, 7 |
| W12 — configuração/versão/publicação | 0, 1, 3, 6 |

Ao terminar cada tarefa, atualizar caixas, testes executados, commit e evidências no relatório de homologação. Não marcar uma tarefa como concluída por mera existência da tela ou por resposta HTTP 200.

## Fontes e próximo passo

Usar a análise como evidência do estado inicial e reconfirmar detalhes externos no início da tarefa 0: [Cloud API — coleção oficial Meta](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api), [Embedded Signup — coleção oficial Meta](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup), [exemplo oficial de Tech Provider](https://github.com/fbsamples/business-messaging-sample-tech-provider-app/blob/main/README.md).

O primeiro trabalho técnico é a tarefa 0, seguida do modelo de conexões da tarefa 2. Em paralelo, orientar o usuário pela tarefa 1 para não descobrir dependências de conta Meta somente no momento dos testes.
