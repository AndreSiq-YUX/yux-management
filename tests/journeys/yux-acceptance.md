# Aceitação das jornadas YUX (T31)

Este documento é a especificação executável e o registro de limites da aceitação transversal. Uma jornada só recebe `complete: true` quando todos os efeitos obrigatórios da matriz T31 pertencem ao mesmo traço e estão persistidos. Passar por uma tela, receber HTTP 200 ou reutilizar dado de exemplo não conclui uma jornada.

## Execução automatizada

A suíte de navegador está em `frontend/tests/journeys/browser/yux-acceptance.pw.ts` e usa Chromium, PostgreSQL, Redis, API Node, worker BullMQ, runtime Python e provedor HTTP controlado. O servidor de aceitação usa somente o banco cujo nome começa com `yux_test_`, apaga apenas filas com prefixo de integração e disponibiliza um controle local autenticado para drenar o worker e ler chamadas do provedor.

```powershell
docker compose --project-name yux-acceptance -f docker-compose.integration.yml up -d --wait
cd workers/marketing-studio-agent-runtime
python -m pip install --require-hashes -r requirements.lock
cd ../../frontend
npm ci
npx playwright install chromium
npm run test:journeys
```

Na CI, o job `Acceptance journeys` instala também as dependências do backend e encerra os serviços com volumes isolados. O artefato `yux-acceptance-evidence` guarda relatório HTML/JSON e, quando houver falha, screenshot, vídeo, trace e logs dos serviços. Credenciais da fixture e tokens de controle são exclusivos do ambiente de teste.

Cada teste anexa JSON no formato:

```json
{
  "schemaVersion": 1,
  "journey": "J3",
  "complete": false,
  "checks": {
    "domainTaskCreated": true,
    "visibleInDailyQueue": true,
    "completionCountOne": true
  },
  "ids": {
    "organizationId": "fixture sanitizada",
    "taskId": "fixture sanitizada"
  },
  "remainingGates": ["etapas ainda não demonstradas no mesmo traço"],
  "evidenceType": "browser-integration"
}
```

## Matriz e rastreabilidade

| Jornada | Efeito de navegador automatizado | Prova complementar já existente | Estado de T31 |
| --- | --- | --- | --- |
| J1 | Altera perfil, cria fonte, drena worker, confirma indexação e refresh | `stack`, `knowledge-publications`, `knowledge-retrieval-policy` | Parcial: falta publicar e consultar o agente no mesmo traço |
| J2 | Revisa item ligado a evidência PDF, publica hash e ativa binding; confirma runtime Python | `strategy-upload`, `publish-governance`, `harness-grounding` | Parcial: falta upload inédito no mesmo traço, revogação e comparação T22 |
| J3 | Exibe tarefa ligada ao lead, exige evidência/minutos, conclui uma vez e confirma refresh | `work-items`, testes de missão composta e aprovação | Parcial: falta iniciar na conversa e manter a mesma missão até o resultado |
| J4 | Cria campanha Radar no workspace interno YUX e confirma organização/persistência | `crm-dispatch`, `provider-intents` e testes de consentimento/opt-out | Parcial: falta um único traço Radar → conversão/opt-out |
| J5 | Planeja, cria conteúdo/versão, revisa, aprova, publica pelo worker, confirma ID remoto e uma chamada ao provedor controlado | `marketing-journey` | Parcial: falta sandbox oficial e captação/atribuição/métrica no mesmo traço |
| J6 | Entrega webhook Meta assinado, persiste mensagem, registra handoff, resolve e recupera após refresh | `whatsapp-webhook-recovery`, `knowledge-retrieval-policy` | Parcial: falta falha/retry, resposta autorizada e acompanhamento no mesmo traço |
| J7 | Alterna A/B como admin, atualiza a tela após refresh e nega leitura/escrita cruzada a membro de A | `tenant-isolation`, `workspace-context` | Automatizada completa |

As provas complementares são regressões obrigatórias, mas não transformam etapas separadas em uma jornada ponta a ponta. Por isso J1–J6 permanecem explicitamente parciais.

## Falhas mínimas que bloqueiam aceite

- Organização B consegue ler ou alterar ID de A.
- Worker ou API declara sucesso sem efeito persistido, ou retry duplica efeito remoto.
- Conteúdo diferente da versão aprovada chega ao provedor.
- Fonte interna ou item rejeitado entra em resposta externa.
- Handoff, tarefa ou progresso desaparece após refresh.
- Interface sai do workspace sem pedido explícito.
- Identidade de publicação, consulta, missão, ação, job, intenção ou resultado remoto aplicável não pode ser reconstruída.

## Sandbox externo

O provedor HTTP da suíte é deliberadamente controlado e registra intenção/payload sem contato comercial real. Antes de fechar J4, J5 e J6, repetir em contas sandbox oficiais selecionadas e registrar: provedor, conta mascarada, horário UTC, intenção, ID remoto, URL/estado final, retry executado e confirmação de que nenhum destinatário real foi usado. OpenRouter/T22 continua bloqueado até existir credencial válida e autorização do teto de custo definido em D-019.

## Teste moderado obrigatório

Selecionar três participantes representativos, preferencialmente sem participação na construção. Não registrar nome, e-mail ou conteúdo comercial; usar apenas P1, P2 e P3.

Para cada participante, executar sem orientação técnica: (1) iniciar uma estratégia; (2) publicar conhecimento já revisado; (3) localizar e acompanhar/concluir uma tarefa. Em uma das três tentativas, pedir refresh antes da conclusão.

| Participante | Estratégia | Publicação | Tarefa | Refresh recuperou | Saídas involuntárias | Observações sanitizadas |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Não executado | Não executado | Não executado | Não medido | Não medido | Aguardando participante |
| P2 | Não executado | Não executado | Não executado | Não medido | Não medido | Aguardando participante |
| P3 | Não executado | Não executado | Não executado | Não medido | Não medido | Aguardando participante |

O gate exige pelo menos 9 sucessos nas 9 tentativas para satisfazer a meta de 90%, zero saída involuntária e recuperação do progresso após refresh. Como são apenas nove tentativas, oito sucessos equivalem a 88,9% e reprovam. Falha bloqueante volta à tarefa responsável; depois da correção, reexecutar o cenário afetado e a regressão essencial.

## Critério de liberação

T31 permanece aberta enquanto houver `remainingGates`, sandbox externo não executado ou teste moderado pendente. T32 pode preparar documentação e mecanismos reversíveis, mas não deve habilitar piloto como se a aceitação completa estivesse aprovada.
