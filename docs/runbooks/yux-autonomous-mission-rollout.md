# Rollout e aceitação — Missões autônomas YUX

## Regra de promoção

Cada etapa é cumulativa. Só avance quando todos os gates da etapa atual estiverem aprovados e a evidência estiver registrada. Falha em qualquer gatilho objetivo exige rollback para a etapa anterior. O deploy do código não autoriza efeitos externos; produção exige uma organização interna, credenciais próprias, orçamento limitado e aprovação humana identificada.

## Pré-requisitos

- migrations até `0147_mission_learning_experiments` aplicadas e registradas;
- backend, worker, Redis, Agent Harness e banco saudáveis;
- pack, contexto, catálogo de capabilities, política de atribuição e golden corpus com hashes fixados;
- provedores sandbox conectados e chaves idempotentes verificáveis;
- operador de plantão familiarizado com o runbook de incidente;
- kill switches de missão e capability testados antes do canário;
- nenhuma pendência cross-tenant, de consentimento, suppression ou efeito externo desconhecido.

## Etapas

### 1. Shadow

Execute as golden missions e uma missão real interna em `shadow`. Confirme: zero mutações; plano válido e compreensível; fontes permitidas; custo estimado; comparação sem regressões; snapshots e traces sem PII/segredos.

### 2. Prepare

Permita somente drafts internos. Confirme que funil, sequência, peças e campanha pausada são revisáveis; publicação, envio e ativação continuam sem efeito ou bloqueados por aprovação.

### 3. Assisted em sandbox

Conecte contas sandbox. Aprove cada efeito externo pelo hash exato. Teste idempotência, callback duplicado, timeout com estado desconhecido, reconciliação e stale approval. Nenhum evento sandbox pode ser atribuído como receita real.

### 4. Assisted live de baixo orçamento

Use uma organização interna, público/contatos de teste autorizados e o menor orçamento tecnicamente útil. Limite uma capability externa e uma versão. Monitore custo, contatos, intervenção humana, latência, reclamações e efeitos desconhecidos durante toda a janela.

### 5. Autonomous time-bound

Solicite e aprove um grant curto, com capability allowlist mínima, limite explícito de custo, horas e contatos. Registre o `envelopeHash`. Não use `latest`; todas as versões permanecem pinadas. Ao expirar, confirme que nova mutação é recusada até um novo grant aprovado.

## Exercício de incidente obrigatório

Durante o canário, execute de forma controlada: pausa da missão; revogação do grant; kill switch da capability/versão; lease expirado; provider timeout com reconciliação; callback duplicado; reversão de custo reservado; e liberação de claims por último. Verifique que nenhum novo dispatch ocorre depois da negação no preflight, enquanto efeitos já aceitos continuam visíveis no ledger.

## Gatilhos de rollback

- mutação sem aprovação/grant aplicável ou depois de revogação/expiração;
- qualquer leitura ou escrita cross-tenant;
- custo, horas ou contatos acima do envelope;
- duplicidade no provedor ou estado desconhecido não reconciliável dentro do SLO;
- segredo, PII ou prompt bruto em snapshot, trace, relatório ou memória;
- aprovação stale, hash divergente ou versão `latest` aceita;
- golden mission, schema, pack protegido, atribuição, custo ou latência com regressão não aprovada;
- disponibilidade do executor abaixo de 99,5% ou p95 de planejamento acima de 60 s.

## Registro de aceitação

Preencha uma linha por etapa:

| Campo | Evidência |
| --- | --- |
| Ambiente e organização interna | Pendente |
| Mission ID e período | Pendente |
| Modo e grant ID/versão/hash | Pendente |
| Pack/contexto/catálogo/atribuição hashes | Pendente |
| Golden corpus hash e resultado | Pendente |
| Valor produzido e política de atribuição | Pendente |
| Custo total, horas humanas e contatos | Pendente |
| Aprovações e mutation leases | Pendente |
| Efeitos externos e reconciliações | Pendente |
| Incidentes e rollback exercitado | Pendente |
| Aprovadores e decisão de promoção | Pendente |

## Estado deste documento

Os gates automatizados e os runbooks fazem parte do repositório. As etapas live devem permanecer como **pendentes** até execução autenticada na VPS/produção com IDs e evidências reais; nunca substituir essa evidência por resultados locais ou mocks.
