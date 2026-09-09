# T32 — Registro final de aceite da correção integrada

Atualizado em 2026-09-06. Estado: **bloqueado; nenhum piloto implantado**.

## Identidade preparada

- Branch candidata: `codex/yux-remediation-integrated`.
- Aceite técnico atual: commit `50004cb83568603cbaa7f7ad2d853c1ebb952417`.
- GitHub Actions: execução `34068006799`, oito jobs aprovados; J1–J7 técnicos
  passaram e a integração persistente passou 23 arquivos/33 testes.
- Preparação T32: commits `6e8191b` e `d066704`; execução `34067099016`
  aprovada nos oito jobs. O segundo commit adicionou uma única repetição para
  falha transitória do instalador de SBOM, mantendo a segunda falha bloqueante.
- Manifesto: `docs/releases/yux-remediation-manifest.json`, validado na CI.
- Estabilização final: a validação posterior ao primeiro registro revelou uma
  edição de perfil vulnerável a uma atualização equivalente e uma recarga
  repetitiva da timeline omnichannel. O commit `8c0dda8` preserva a edição em
  andamento, limita cada carga de mensagens e adiciona regressões unitárias. O
  commit `50004cb` corrigiu a observação do endpoint real de resolução; a
  execução final passou sem repetição automática de jornadas mutáveis.
- Release implantável: ainda sem commit final, digests, hash final do manifesto,
  backup restaurado ou organizações aprovadas.

## Gates de liberação

| Gate | Estado | Evidência presente | Falta para aceite |
| --- | --- | --- | --- |
| Backup restaurado | não executado | runbook e ativos obrigatórios definidos | restauração recente identificada e validada |
| Migrations verificadas | não executado no alvo | inventário de 70 arquivos e hash agregado na CI | histórico/checksums e logins mínimos no alvo |
| Matriz de tenants | não executada no piloto | regressão persistente técnica aprovada | repetir contra as imagens/DB do piloto |
| Contratos | não executado nas imagens publicadas | geração e testes técnicos aprovados | smoke entre digests implantados |
| Jornadas | parcial | sete jornadas técnicas aprovadas | IDs/efeitos completos J1–J6, sandbox e três sessões moderadas |
| Qualidade estratégica | bloqueado | infraestrutura T22 aprovada | orçamento OpenRouter autorizado e dois avaliadores cegos |
| Reconciliação histórica | ensaio isolado aprovado | mecanismo T30 e CI aprovados | `--dry-run` em restauração recente e, depois, janela aprovada |

## Registro operacional a preencher sem dados pessoais

| Campo | Valor |
| --- | --- |
| Commit da release | pendente |
| Digest backend | pendente |
| Digest frontend | pendente |
| Digest Agent Runtime | pendente |
| SHA-256 do manifesto final | pendente |
| Commit estável anterior | pendente |
| ID do backup e restauração | pendente |
| UUID do workspace interno | pendente |
| UUID da organização piloto | pendente |
| Janela de início/fim | pendente |
| Integrações sandbox selecionadas | pendente |
| Rotinas essenciais observadas | pendente |
| Decisão final e responsáveis | pendente |

## Critério de encerramento

T32 só muda para `aceita` depois de: versão identificável em todos os serviços;
todos os gates obrigatórios em `passed`; 24 horas e uma amostra de cada rotina
essencial; ausência de falha bloqueante; e resposta operacional conhecida para
cada alerta. Funcionalidade deliberadamente indisponível deve permanecer
desligada com sua alternativa registrada, sem ser apresentada como concluída.

Até lá, o manifesto permanece `blocked`, as organizações ficam vazias e as
flags de efeitos novos permanecem desligadas. Este registro não autoriza acesso
à produção, consumo pago ou contato externo.

## Adendo de correções pós-implantação — 2026-09-09

- Implementados localmente: isolamento do migrador; credenciais obrigatórias por serviço; preparação dos volumes; falha recuperável na ingestão; gate do Supervisor de Missões; rotas canônicas do Marketing Studio; seleção do heartbeat atual; diagnóstico operacional no Admin; e distinção entre aprovação e publicação estratégica.
- Verificação técnica local: testes focados, type-checks e builds aprovados. A integração persistente exige PostgreSQL/Redis e será executada na CI.
- Implantação: pendente de commit, push, execução verde da CI, provisionamento das credenciais por serviço no Dokploy e novo deploy observado.
- Backup/restauração: adiado por decisão explícita do proprietário; permanece `not_run` e não será apresentado como gate cumprido.
- Recuperação do livro ausente: depende do reenvio autorizado dos bytes e não faz parte da alteração de código.
