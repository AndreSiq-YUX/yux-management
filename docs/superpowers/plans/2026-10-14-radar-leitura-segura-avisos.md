# Radar leitura segura e avisos precisos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Identificar corretamente falhas na leitura pública, permitir autorização manual restrita para certificado do site vencido e não atribuir ausência de conteúdo a uma configuração de IA não verificada.

**Architecture:** Classificar erros do transporte em diagnóstico seguro e limitado, preservado nas páginas do dossiê. Acrescentar concessão auditável do Admin YUX, vinculada à pesquisa, hostname e certificado, para leitura pública excepcional por uma hora. Validar independentemente os demais requisitos TLS antes de enviar HTTP; separar leitura, associação e execução de IA.

**Tech Stack:** Node.js/TypeScript, leitor HTTP/HTTPS existente, OpenSSL 3.5, PostgreSQL/RLS existente, React e Vitest.

**Spec:** Especificação e diagnóstico deste documento, derivados da aprovação do usuário em 14/10/2026. Execução nativa preservada; revisão deste plano antes de implementar.

## Global Constraints

- Não executar buscas ou modelos pagos, alterar modelos, fontes, custos ou permissões em produção durante o desenvolvimento.
- TLS estrito por padrão. Somente a expiração do certificado final pode receber exceção manual; nunca desligar TLS globalmente, contornar robots/CAPTCHA ou promover conteúdo não associado a evidência institucional.
- Exceção limitada a GET público sem cookies, autenticação, formulários ou execução de scripts; não se aplica a integrações, provedores, pagamentos ou chamadas de IA.
- Somente `yux_admin` ativo autoriza/revoga. Concessão dura 3600 segundos, vale apenas para organização/candidato/run/revisão/hostname/certificado registrados e não migra para nova pesquisa. Troca de certificado exige nova autorização se continuar inválido.
- Não fixar domínio, cidade ou empresa no código de produção; os casos reais são apenas diagnóstico/fixtures.
- Preservar limites de tempo, tamanho, páginas, chamadas, isolamento, proteção contra endereços privados, histórico e leads aprovados.
- Não renovar certificado de site de terceiro, adicionar serviços ou fallback pago sem autorização específica.
- Preservar o visual YUX e o roteamento central de IA. Retomar não reinicia consultas pagas nem repete chamadas incertas.

## Diagnóstico reproduzido

Em 14/10/2026, Node v22.16.0 e `getRadarPublicPage` resolveram `embrare.com.br` para IPv4 público e retornaram `CERT_HAS_EXPIRED` ao consultar `/robots.txt`. A versão `www` retornou o mesmo erro. O endpoint HTTP redirecionou para HTTPS, portanto não oferece uma alternativa válida.

A inspeção independente da cadeia, com OpenSSL e `-verify_return_error`, mostrou certificado de CN `embrare.com.br`, emitido por Let's Encrypt R12, válido até **09/04/2026 06:42:43 UTC**. Não houve leitura com validação desativada. Isso reproduz localmente uma causa concreta compatível com o aviso; não é uma inspeção do processo do worker em produção.

O leitor atualmente converte todo erro de conexão ao robots, exceto timeout, em `robots_transport_failed`, apagando a distinção de certificado. A pipeline exclui páginas não lidas dos insumos da IA, mas exibe uma mensagem genérica que também pede configurar rota, sem ter testado se falta uma rota.

## Especificação

1. Certificado vencido, certificado inválido, timeout, conexão recusada/interrompida e erro desconhecido devem ser distinguíveis sem expor mensagens brutas, caminhos internos ou credenciais.
2. `robots_disallow` continua sendo proibição explícita; erro de TLS/transporte não significa proibição, ausência de site ou empresa inativa.
3. Falha de TLS não autoriza leitura automaticamente. O dossiê mostra hostname, vencimento e risco, oferecendo ao Admin YUX a confirmação “Autorizo a leitura pública deste site apesar do certificado vencido”. Sem texto livre obrigatório. A exceção não renova nem regulariza o certificado externo.
4. Nenhuma página institucional legível: avisar que a identificação aguarda leitura e que a IA não foi executada. Não afirmar falta de modelo/rota.
5. Páginas legíveis com rota realmente ausente: manter o aviso específico da rota. Serviço não disponível, evidência não associada e resposta inválida também permanecem motivos distintos.
6. Qualificação e perfil devem indicar dependência de conteúdo associado quando essa for a causa, evitando repetir uma orientação de configuração não verificada.
7. Preservar diagnóstico de página no dossiê e nas retomadas. Falhas transitórias e de certificado podem ser tentadas novamente apenas numa retomada explícita, dentro dos limites; sem cobranças adicionais de busca quando as consultas já foram concluídas.
8. Autorizar salva a concessão sem iniciar jobs ou consumo pago. O usuário então usa “Retomar pesquisa desta empresa”, com a confirmação de custos existente. Revogação impede novas leituras; requisição pública já concluída permanece no histórico com sua ressalva.
9. Verificar assinatura/cadeia confiável, hostname e datas dos demais certificados independentemente do erro inicialmente informado por Node. Certificado autoassinado, hostname incorreto, cadeia inválida, certificado ainda não válido ou intermediário vencido continuam bloqueados, mesmo se coexistirem com expiração do certificado final.
10. As evidências coletadas sob exceção levam `tlsException` com concessão, hostname, impressão digital e data de leitura. Dossiê e entrega ao CRM preservam a ressalva. Isso não confirma operação da empresa, titularidade de contato ou consentimento de contato.

## Review Focus

1. Certificado vencido permanece bloqueado sem concessão válida; uma concessão não aceita hostname errado ou cadeia inválida também presentes. Sem downgrade automático para HTTP.
2. Concessão de outra organização/run/hostname/certificado, vencida, revogada ou autorizador inativo não permite leitura; redirecionamento não amplia seu escopo.
3. Modelo configurado e páginas ilegíveis não produz pedido incorreto de configurar modelo nem chamada paga; páginas legíveis com rota realmente ausente mantêm orientação específica.
4. Aprovar/revogar não dispara custos, não perde auditoria por checkpoints concorrentes e nunca permite ação a cliente/operador sem autorização de Admin YUX.
5. Retomar preserva orçamento/histórico e ressalvas TLS inclusive no CRM; site ainda inacessível não altera leads aprovados, e robots/IP privado continuam bloqueados.

## Task 1 Diagnóstico seguro do leitor

**Files:** criar `backend/src/modules/radar/site-read-errors.ts` e `backend/tests/radar-site-read-errors.test.ts`; modificar `b2b-site-inspection.ts`, `site-evidence.ts`; ampliar `backend/tests/radar-b2b-site-inspection.test.ts`, `radar-pinned-transport.test.ts` e `radar-site-evidence.test.ts`.

**Interfaces:** `classifyRadarReadError(cause: unknown, stage: 'dns'|'robots'|'page')` retorna `{reason: string, diagnostic: RadarReadDiagnostic}`. `RadarReadDiagnostic` contém somente `stage`, `kind` e `code` de um conjunto permitido. `RadarSiteEvidence`/`RadarBusinessSiteInspection` recebem `diagnostic?`; não há migração de banco.

- [x] Escrever RED: erro `{code:'CERT_HAS_EXPIRED'}` na consulta de robots retorna `robots_tls_expired`, mantém status desconhecido, não consulta HTML nem tenta HTTP; `ECONNRESET` é distinto; erro desconhecido contendo segredo não expõe mensagem; robots proibitivo e bloqueio de IP privado permanecem intactos.
- [x] Executar `npm --prefix backend test -- tests/radar-site-read-errors.test.ts tests/radar-b2b-site-inspection.test.ts tests/radar-pinned-transport.test.ts tests/radar-site-evidence.test.ts`. Esperado: FAIL nos comportamentos novos.
- [x] Implementar classificação de códigos permitidos e propagação do diagnóstico. Manter verificação TLS, resolução/IP fixado, portas e redirecionamentos existentes. Atualizar a versão do leitor e a lista de falhas retomáveis, sem loop automático.
- [x] Reexecutar o mesmo comando. Esperado: PASS, sem rede externa nos testes.
- [x] Commit `fix(radar): preserve safe website transport diagnostics`.

## Task 2 Transporte excepcional, limitado e verificável

**Files:** criar `backend/src/modules/radar/site-tls-exception.ts` e `backend/tests/radar-site-tls-exception.test.ts`; modificar `backend/src/modules/radar/b2b-site-inspection.ts`, `site-evidence.ts`, `backend/Dockerfile.dokploy` e `backend/tests/radar-pinned-transport.test.ts`.

**Interfaces:** exportar `RadarTlsExceptionGrant = {id:string;organizationId:string;candidateId:string;runId:string;configurationRevision:number;hostname:string;fingerprint256:string;approvedBy:string;approvedAt:string;expiresAt:string;revokedAt?:string}`. `inspectRadarBusinessSite` e `collectRadarSiteEvidence` recebem opção `tlsException?: RadarTlsExceptionGrant`; o transporte recebe o mesmo contexto por requisição, nunca variável global. Exportar `probeRadarExpiredCertificate(url:URL,address:string):Promise<{hostname:string;fingerprint256:string;validTo:string}>` (somente handshake, sem HTTP) e `verifyRadarExpiredCertificate(chain:Buffer[],hostname:string,now:Date):Promise<void>`.

- [x] RED em servidor TLS local com certificados de teste: padrão estrito rejeita vencido; concessão correta permite GET público; certificado vencido com hostname errado ou cadeia não confiável não recebe GET; intermediário vencido e folha ainda não válida não recebem GET; impressão digital diferente bloqueia; robots proibitivo e IP privado continuam bloqueados. Verificar ausência de cookies/Authorization e de mudança em `NODE_TLS_REJECT_UNAUTHORIZED`.
- [x] Executar `npm --prefix backend test -- tests/radar-site-tls-exception.test.ts tests/radar-pinned-transport.test.ts tests/radar-b2b-site-inspection.test.ts tests/radar-site-evidence.test.ts`. Esperado: FAIL nos casos novos.
- [x] Implementar handshake isolado para obter cadeia, tamanho máximo 64 KiB e deadline dentro dos 8 segundos existentes; nenhum HTTP antes de verificar o peer. Usar OpenSSL por `execFile`, sem shell e sem argumentos controlados pelo cliente: cadeia confiável com raízes do Node, `-no_check_time`, propósito servidor e hostname; verificar separadamente datas de cada certificado do caminho aceito, permitindo somente folha vencida. Ancorar a raiz por impressão digital no conjunto confiável; cadeia incompleta/ambígua que não possa ser verificada falha fechada. Não usar apenas `authorizationError` como prova de que expiração é o único defeito.
- [x] Adicionar OpenSSL ao runtime Docker, manter bibliotecas corrigidas e usuário não privilegiado. Conexão excepcional usa IP público fixado, SNI/hostname e fingerprint aprovados; agente/socket não é reutilizado entre concessões. Conceder socket ao cliente HTTP somente após validação. Não reutilizar sessão TLS que dispense checagem de certificado. Redirecionamentos continuam sujeitos às regras existentes e à autorização exata de hostname.
- [x] GREEN no comando focado e build backend. Certificados de testes são exclusivamente fixtures locais, sem serviço pago ou leitura insegura de site real. Commit `feat(radar): add scoped expired-certificate public reader`.

## Task 3 Concessão auditável e autorização no dossiê

**Files:** criar `backend/src/db/migrations/0187_radar_tls_exceptions.sql`, `backend/src/modules/radar/tls-exception-service.ts`, `backend/tests/radar-tls-exception-service.test.ts`, `backend/tests/integration/radar-tls-exceptions.test.ts`; modificar `backend/src/modules/radar/routes.ts`, `research-service.ts`, `site-evidence.ts`, `crm-delivery.ts`, `frontend/src/services/radarService.ts`, `frontend/src/types/radarResearch.ts`, `frontend/src/components/radar/RadarCandidateResearchPanel.tsx` e seus testes. Atualizar inventários de migrations/release que os verificadores existentes exigirem.

**Interfaces:** tabela `radar_site_tls_exceptions` com UUID, FKs para organização/candidato/run/autorizador, revisão inteira, hostname, fingerprint SHA256, validade original do certificado, approved_at/expires_at/revoked_at/revoked_by. Datas obrigatórias e janela máxima de 3600 segundos; índice `(organization_id,run_id,hostname,expires_at)` e políticas FORCE RLS iguais ao escopo das pesquisas. Não conceder DELETE aos papéis de serviço; revogar sem apagar auditoria. API `POST /candidates/:id/research/tls-exceptions` recebe `{organizationId,runId,configurationRevision,diagnosticId,confirmed:true}`; nunca recebe URL, fingerprint, datas ou aprovador arbitrários. API `POST /candidates/:id/research/tls-exceptions/:grantId/revoke` recebe `{organizationId}`. `diagnosticId` referencia falha persistida, calculada a partir de run/hostname/certificado pelo servidor. GET research expõe diagnósticos e concessões visíveis daquele escopo. Serviço `authorizeRadarTlsException(pool,user,input):Promise<RadarTlsExceptionGrant>` revalida vínculo, Admin ativo, revisão, candidato pendente e certificado no handshake antes de salvar. `revokeRadarTlsException(pool,user,input):Promise<void>` aplica o mesmo escopo.

- [x] RED unitário e SQL real: cliente/operador recebe 403; organização/candidato/run/revisão divergentes falham; autorização usa certificado observado pelo servidor, expira em 3600s e não dispara fila ou fornecedor; revogação é idempotente e preserva autor/data; nova geração não herda concessão; checkpoint concorrente não apaga auditoria. Worker revalida concessão e Admin ativo antes de cada leitura e nunca aceita flag arbitrária do job.
- [x] Executar `npm --prefix backend test -- tests/radar-tls-exception-service.test.ts tests/radar-research-persistence.test.ts` e `npm --prefix backend run test:integration -- tests/integration/radar-tls-exceptions.test.ts`. Banco exclusivamente local pela variável de teste existente. Esperado: FAIL nos comportamentos novos.
- [x] Implementar migration e serviço com parâmetros SQL e transações nos bloqueios de candidato existentes. Concessão armazenada separadamente do output dos checkpoints; identificação do site pelo servidor não confere autorização a novos domínios. Revalidar validade/revogação imediatamente antes de conectar; conexão em andamento pode terminar, mas não inicia a próxima página após revogação.
- [x] RED UI: alerta mostra site e vencimento; botão só disponível a Admin YUX, exige checkbox explícito e não exige referência textual; sucesso apenas atualiza dossiê e oferece retomada; cliente vê ressalva, não controle de aprovação. Resultado e CRM retêm `tlsException` nas evidências de origem. Não exibir “contato confirmado” apenas por sucesso de leitura TLS.
- [x] Executar `npm --prefix frontend test -- --run src/components/radar/RadarCandidateResearchPanel.test.tsx` e `npm --prefix backend test -- tests/radar-crm-delivery.test.ts`. Implementar fluxo visual YUX sem modal de navegador inseguro. GREEN em todos os testes desta tarefa; commit `feat(radar): authorize and audit exceptional public website reads`.

## Task 4 Avisos por etapa e verificação

**Files:** modificar `backend/src/modules/radar/research-service.ts` e `frontend/src/lib/radar/radarResearchMessages.ts`; ampliar `backend/tests/radar-research-service.test.ts`, `radar-research-persistence.test.ts`, `frontend/src/components/radar/RadarCandidateResearchPanel.test.tsx`; criar `frontend/src/lib/radar/radarResearchMessages.test.ts`.

**Interfaces:** consome `RadarSiteEvidence.diagnostic?` da Task 1 e `tlsException?` das Tasks 2/3. Sem página institucional legível, os avisos de identificação, qualificação e perfil descrevem a dependência de leitura. Códigos `radar_presence_explicit_route_required`/`radar_qualification_explicit_route_required` continuam exclusivos da verificação efetiva da rota. O componente mantém apresentação YUX e permite consultar páginas/evidências.

- [x] Escrever RED: páginas com `robots_tls_expired` não invocam `resolvePresence`/`qualify` e não orientam configurar rota; páginas legíveis com rota ausente exibem o código correto; faltando associação, perfil/qualificação aguardam identificação; diagnóstico sobrevive ao checkpoint/persistência; texto de certificado vencido é distinto de proibição/timeout.
- [x] Executar `npm --prefix backend test -- tests/radar-research-service.test.ts tests/radar-research-persistence.test.ts` e `npm --prefix frontend test -- --run src/lib/radar/radarResearchMessages.test.ts src/components/radar/RadarCandidateResearchPanel.test.tsx`. Esperado: FAIL nos avisos novos.
- [x] Separar condições e traduzir os códigos específicos. Não alterar rotas, modelo, orçamento, fontes ou validação de identidade para fazer os testes passarem.
- [x] Executar os comandos focados, suites completas backend/frontend e `type-check`/builds. Esperado: PASS. Validar renderização do dossiê com fixtures locais; nenhuma pesquisa paga.
- [x] Revisão final única prevista pela skill de execução; achados importantes corrigidos com RED→GREEN. Publicar em `main` conforme autorização vigente, sem deploy automático. Informar migration, nova autorização manual e limites; não declarar que o certificado externo foi corrigido ou que houve piloto pago real.

## Self-review

Task 1 cobre diagnóstico; Task 2 cobre Review Focus 1/2/5 com TLS real local; Task 3 cobre 2/4/5 com autorização, RLS, concorrência, UI e proveniência; Task 4 cobre 3/5 com comunicação e regressão completa. Exceção é exclusivamente expiração da folha e leitura pública aprovada, não bypass genérico de TLS nem navegação autenticada. Não inclui outro fornecedor, reprocessamento pago real, correção de certificado externo ou mudança de modelos. Especificação revista em resposta ao pedido explícito do usuário de permitir aprovação manual; aprovada e implementada, com verificação e revisão final concluídas.

## Verificação de entrega — 14/10/2026

- Backend: 909 testes; frontend: 645 testes; PostgreSQL do Radar: 13 testes de integração. Builds, orçamento de bundle e manifesto verificados.
- Revisão independente: nenhuma falha crítica; um achado importante de endereço final após redirecionamento corrigido com regressões RED→GREEN. Leitura de contatos segue a origem final validada, sem aceitar links externos.
- Interface validada em Chrome local: aviso, consentimento único, autorização sem iniciar pesquisa e revogação. Sem erros da aplicação; avisos preexistentes de evolução do React Router. Viewport móvel não exercitado.
- A observação de certificado do teste de tela foi simulada; transporte TLS e serviço de concessão tiveram testes reais locais. Probe gratuito de metadados da Embrare validou a cadeia ignorando exclusivamente a expiração da folha, sem enviar HTTP nem ler conteúdo excepcionalmente.
- Decisão de interface: preservados fieldset/checkbox nativos do painel e Button YUX instalado; nenhuma migração de biblioteca visual. Eventual revisão dessa escolha afeta somente apresentação.
- Sem chamadas pagas, alterações de modelos, deploy ou mudanças no banco de produção durante a implementação. Publicação em main conforme autorização vigente.
