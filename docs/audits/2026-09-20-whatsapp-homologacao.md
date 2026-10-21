# WhatsApp — registro de homologação SaaS

Data de abertura: 20/09/2026 19:11 -03:00
Status em 21/10/2026: preparação local de transporte verificada; publicação, credenciais e envio real pelo YUX pendentes. O envio anterior ocorreu somente no painel Meta.

Este registro acompanha a homologação do WhatsApp Cloud API da YUX. Os valores abaixo não incluem tokens, App Secret, números de telefone pessoais ou outras credenciais protegidas.

## Base candidata

| Item | Resultado | Evidência |
| --- | --- | --- |
| Checkout local | `8f4563543154fe539ff5d77efd3eb545159b001b` | `HEAD` e `origin/main` apontam para o mesmo commit em 20/09/2026 |
| Versão publicada consultada | `43d32126a5c98242f3ae77167910fc1ed208aa29` | `GET https://hub.yux.com.br/api/health` retornou HTTP 200 |
| Relação entre bases | Publicado é ancestral do checkout local | `git merge-base --is-ancestor` confirmou; não há commits publicados fora do checkout local |
| Diferença relevante | Produção está atrás do checkout | `git diff --stat 43d32126a5c98242f3ae77167910fc1ed208aa29 HEAD` registrou as alterações locais posteriores |
| API Graph candidata | `v26.0` | Documentação oficial de versões da Meta: lançada em 29/07/2026; expiração ainda não definida |
| Versão atualmente fixada no caminho WhatsApp | `v20.0` | Encontrada no OAuth, provider e serviço frontend; será parametrizada na tarefa 3 |

## Ambiente de execução

| Caso | Horário | Versão/base | Organização | Conexão | Esperado | Obtido | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Testes direcionados backend | 20/09/2026 19:09 -03:00 | `8f45635` / Vitest 4.1.9 | não aplicável | não aplicável | Suítes previstas passarem | 8 arquivos, 53 testes aprovados | saída local do comando de teste; sem rede Meta |
| Testes direcionados frontend | 20/09/2026 19:09 -03:00 | `8f45635` / Vitest 4.1.11 | não aplicável | não aplicável | Suítes previstas passarem | 3 arquivos, 13 testes aprovados | saída local do comando de teste; warnings de configuração sem falha |
| Serviços persistentes da integração | 20/09/2026 19:08 -03:00 | `docker-compose.integration.yml` | `yux_test_integration` planejada | Redis `yux-integration` planejado | Postgres e Redis dedicados disponíveis | Não executado: Docker/Podman não está disponível nesta máquina | `docker` e `podman` não encontrados; `psql` também não encontrado |
| Saúde publicada | 20/09/2026 19:08 -03:00 | commit publicado acima | produção | webhook ainda não homologado | Identificar release publicada sem expor segredo | HTTP 200; commit e hash do manifesto retornados | `https://hub.yux.com.br/api/health` |

## Confirmação externa para implementação

- A Cloud API e o Embedded Signup serão baseados nas coleções oficiais da Meta no Postman:
  - [WhatsApp Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api)
  - [Embedded Signup](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup)
- Para a jornada SaaS, o fluxo confirmado é o de Facebook Login for Business/Embedded Signup, com validação no servidor dos ativos retornados pelo navegador. A conclusão exige verificar WABA, números, permissões e inscrição da aplicação; o payload do navegador não será tratado como prova suficiente.
- A documentação oficial da Meta exige HTTPS para o fluxo publicado e orienta iniciar App Review/Advanced Access para `business_management` e `whatsapp_business_management` antes da liberação.
- O callback de onboarding e o webhook de mensagens permanecem conceitos distintos. O callback será definido pela implementação final; o webhook de mensagens previsto no plano é `https://hub.yux.com.br/api/webhooks/meta/channel-event`.

## Evidência recebida do painel Meta — 22/09/2026

| Caso | Horário | Versão/base | Organização | Conexão | Esperado | Obtido | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Envio do número de teste ao telefone verificado | 22/09/2026 | Painel Meta gerou chamada em `v25.0` | organização de homologação Meta | número de teste exibido no painel | Mensagem de teste entregue ao destinatário | Teste concluído no painel; eventos `messages` registrados às 19:19 e 19:23 | Imagens anexadas pelo usuário; IDs não repetidos neste documento |
| Eventos de webhook de teste | 22/09/2026 | Campo `messages` | organização de homologação Meta | WABA do teste | Meta emitir eventos de mensagem | Eventos visíveis no painel Meta | Ainda não prova persistência/consumo pelo YUX |
| Credencial temporária | 22/09/2026 | Token de desenvolvimento | organização de homologação Meta | número de teste | Credencial não exposta | Token apareceu legível na imagem compartilhada | Considerar comprometido; regenerar antes de qualquer uso posterior |

Esta evidência comprova apenas o transporte básico dentro do ambiente de teste da Meta. Ainda não comprova recebimento no backend YUX, persistência, roteamento por organização, Embedded Signup ou operação com múltiplos números.

## Pendências para encerrar a tarefa 0

- [ ] Disponibilizar Docker/Podman ou uma alternativa dedicada com Postgres e Redis de integração.
- [ ] Subir os serviços de teste e executar `tests/integration` com o rig, sem apontar para produção.
- [ ] Confirmar no painel da Meta a versão efetivamente aceita pela configuração do aplicativo e registrar eventual divergência de `v26.0`.
- [ ] Criar a organização de homologação e, na tarefa 1, registrar App ID, WABA ID, Phone Number ID e destinatário de teste somente nos mecanismos protegidos do servidor.

## Status Meta — 22/09/2026

- O modo `Independent Tech Provider` foi selecionado para o aplicativo YUX.
- A verificação da empresa aparece como `Em análise`.
- A análise do app aparece como `Em análise`; as etapas de revisão de configurações e vídeo permanecem bloqueadas enquanto a análise externa não avança.
- O painel indica `0 de 2 etapas concluídas` para a integração do Provedor de Tecnologia.
- Aguardar a decisão da Meta sem alterar portfólio, dados legais, permissões ou configuração do provedor, pois uma alteração pode reiniciar a análise.
- Enquanto aguarda, é permitido avançar em código, testes locais, documentação, preparação de política de privacidade, vídeo de demonstração e organização dos dados de homologação.

## Preparação de código enquanto a Meta analisa — 22/09/2026

- Criada a migration `0174_whatsapp_saas_connections.sql`, ainda não aplicada, com preflight que interrompe em caso de Phone Number ID ativo duplicado e índice único por número ativo.
- Criado o contrato de persistência `upsertVerifiedWhatsAppConnection`, que valida vínculos opcionais de assistente/equipe/fila na mesma organização e grava a credencial somente no cofre criptografado dentro da transação.
- O envio humano agora rejeita `connectionId` diferente da conexão da conversa, evitando roteamento cruzado.
- Verificação local: 60 testes direcionados aprovados em 9 arquivos e `npm run type-check` aprovado.
- A suíte de integração com roles reais permanece pendente porque esta máquina ainda não possui Postgres/Redis dedicados disponíveis.

## Atualização da Meta e isolamento SaaS — 25/09/2026

- A captura do painel confirma a verificação da empresa como `Aprovado`; a análise do app permanece `Em análise`.
- O painel pede revisão das configurações do app (ícone, URL da Política de Privacidade e categoria) e exibe instruções de vídeo para `whatsapp_business_messaging` e `whatsapp_business_management`.
- A análise do app já foi enviada e segue em análise; não editar nem reenviar a solicitação atual sem uma exigência da Meta. A demonstração em vídeo deve mostrar o app YUX enviando a mensagem e a interface WhatsApp recebendo-a; o teste feito diretamente no painel Meta não substitui essa demonstração.
- A migration `0174` agora inclui uma política RLS para a API ler/gravar segredos criptografados somente nas organizações presentes no contexto autenticado. A política de leitura do worker permanece separada.
- Adicionado teste de integração para empresa A com dois números, empresa B com um número, reconexão, tentativa de leitura cruzada de segredo, tentativa de gravar sob contexto de outra empresa, resposta pela conexão errada e associação concorrente do mesmo número.
- O worker de envio agora usa a conexão configurada na conversa e recusa divergência com a mensagem, organização ou canal; o dispatcher de CRM também restringe a conexão à organização/canal da conversa.
- O Redis local é `3.0.504`, incompatível com o mínimo `5.0.0` exigido pelo BullMQ. A tentativa com ele foi recusada pelo próprio BullMQ; o serviço Redis existente na porta padrão não foi usado nem alterado.
- Para executar já as verificações de banco, o harness recebeu modo opcional de fila fail-fast (padrão continua Redis real). Os dois testes `whatsapp-saas` passaram com roles reais em Postgres 17 temporário, na porta `55432`: isolamento, reconexão, negação cruzada e associação concorrente. Nenhum job é aceito nesse modo.
- A migration `0174` foi aplicada somente ao banco temporário `yux_test_integration`; ao final dos testes, não restaram conexões ou segredos de fixture. Ela não foi aplicada em desenvolvimento compartilhado nem produção.
- Verificações: `npm run type-check` passou; os testes direcionados (`omnichannel-outbound`, `crm-dispatch`, `whatsapp-connections` e `omnichannel-routes`) passaram: 23 testes em 4 arquivos; `git diff --check` não apontou erros. A suíte que exercita filas reais continua pendente de Redis compatível.

## Regra de evidência

Um teste só será marcado como homologado quando houver caso, horário, versão, organização, conexão, resultado esperado, resultado obtido e evidência sanitizada. HTTP 200, existência de tela ou token configurado localmente não são, isoladamente, prova de envio, recebimento, isolamento ou onboarding SaaS.

## Retomada — 21/10/2026

- Ambiente dedicado local: PostgreSQL 17 em `127.0.0.1:55432` e Redis 8.10.2 em `127.0.0.1:56379`; sem alteração dos serviços do sistema. O bloqueio anterior de infraestrutura de testes foi resolvido.
- Suítes completas locais: backend 777 testes e frontend 618 testes aprovados, após as correções da revisão. Backend type-check aprovado. A composição local inclui alterações de outras frentes; a candidata isolada sobre `origin/main` terá verificação própria antes de publicação.
- Integração com PostgreSQL/Redis reais: 5 arquivos, 9 testes aprovados em 21/10 às 20:06 -03. Casos: isolamento SaaS, recuperação de webhook, provisionamento interno restrito, envio transacional/outbox, indisponibilidade Redis, reinício, janela de 24h, resultado ambíguo e concorrência de dois workers. A Meta foi substituída por servidor HTTP controlado: **não comprova envio real**.
- Revisão independente encontrou e motivou três correções verificadas por testes que falharam antes da correção: resultado incerto não vira falha reenviável quando a gravação falha; duas execuções de saída disputam uma única tentativa sob trava transacional; retentativa de requisição do formulário preserva os dados e o identificador após resposta perdida.
- Navegador local: formulário exige confirmação, acompanha mensagem pelo fluxo normal, distingue aceitação de entrega e não reenvia automaticamente após aceitação. Desktop e celular (390px) sem overflow horizontal. Destinatário de fixture fictício; nenhum envio Meta nessa validação.
- Diagnóstico remoto implementado para token/app/permissões, número e inscrição da WABA; envio e recebimento permanecem explicitamente não comprovados. Provisionamento de teste limitado por organização e Phone Number ID no servidor, apenas para administrador interno, com token criptografado.
- Painel Meta consultado: empresa aprovada, App Review em análise. Configurações básicas ainda apontam ícone, Política de Privacidade e categoria ausentes; não editar ou reenviar a análise pendente sem esclarecer seu estado. A leitura da chave do app exigiu confirmação da senha pelo titular.
- Produção consultada: health identificou `0a665d19125999d61177c1916fb08d8559da91ac`; webhook respondeu `503 webhook_not_configured`. Configurações Meta ausentes no serviço, chave de criptografia existente. Nenhuma configuração de produção alterada nesta retomada.
- `origin/main` está em `67655019fe46eaeefe663d2c186c5f7c28df59b6`, com avanços Radar posteriores à branch local. Preparação isolada em worktree próprio para preservar esses avanços e não incluir alterações Project Delivery do usuário.
- Destinatário humano confirmado para uma única mensagem de teste. Não registrar seu telefone nem credenciais neste documento. Ainda não enviado.
- Próximos critérios: integrar candidata na base atual, verificar migrations/backup/reversão, configurar segredos no servidor, validar webhook assinado, receber mensagem real e responder pelo portal. Modo automático, transferência humana e onboarding externo continuam nas tarefas 7–9.

### Candidata isolada verificada — 21/10/2026, 20:12 -03

- Branch `codex/whatsapp-homologacao`: `740b862` (fundação) e `8f198b2` (onboarding/transporte), sobre main `6765501`. Nenhuma alteração Project Delivery foi transportada; avanços Radar mantidos. Manifesto recomposto: 135 migrations, última `0234_radar_funnel_block_audits.sql`.
- Backend: type-check aprovado; suíte completa 1.430 aprovados, 126 ignorados. Primeiro run paralelo teve um timeout de 5s no teste de manifesto; reexecução completa com dois workers aprovada sem mudar código/timeout.
- Frontend: suíte completa 1.190 aprovados; build com TypeScript e orçamento de bundle aprovado. Lint direcionado dos arquivos WhatsApp aprovado.
- Integração candidata: 5 arquivos, 9 testes aprovados com PostgreSQL/Redis reais e provedor HTTP simulado. Banco separado `yux_test_whatsapp_candidate_20261021`; migrations aplicadas somente neste ambiente de teste.
- Acesso seguro: HTTPS documentado `deploy.yux.com.br` falhou na validação SSL; painel acessível consultado usa HTTP. Não transferir App Secret por esse acesso. Tentativa de manutenção SSH sem autenticação disponível. Solicitar ao titular o caminho seguro já existente antes de alterar acesso/rede.
- Backup: Dokploy mostra `No backups configured`; isso não comprova ausência de backup externo/snapshot. Confirmação solicitada ao titular antes de migrations produtivas.
- Confirmação de senha Meta concluída pelo titular. Nenhuma chave foi copiada para documentação ou configurada no servidor. Nenhuma mensagem real enviada e nenhuma publicação efetuada.

### Autorizações e acesso seguro — 21/10/2026

- Titular confirmou ausência de backup/snapshot e autorizou expressamente continuar mesmo sem backup. Esta é uma exceção ao gate de backup do plano, com risco aceito de indisponibilidade/perda de dados sem restauração garantida; não equivale a backup testado nem autoriza exclusões de dados.
- Titular autorizou habilitar HTTPS para `deploy.yux.com.br`, com e-mail de avisos de certificado fornecido na sessão. DNS A aponta para a VPS existente; Dokploy configurado com HTTPS e Let's Encrypt. Acesso original por IP preservado; nenhuma regra de firewall alterada.
- Verificação externa às 20:24 -03: `https://deploy.yux.com.br` respondeu HTTP 200 com validação normal de certificado (sem ignorar erros TLS). Página de login abriu normalmente no navegador. Solicitado login do titular no novo domínio antes de transferir configurações sensíveis.
- Mudança de URL do Dokploy exibe aviso sobre integração GitHub/autodeploy. Conferir recebimento de webhook e publicação manual se necessário; não assumir que o webhook mudou automaticamente.
