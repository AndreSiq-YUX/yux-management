# Radar — prontidão local para OpenRouter Decisions

Data: 19/10/2026. Escopo: B1–B5, integração operacional nativa, sem ativação ou chamadas pagas. Branch `codex/radar-brave-state-fixes`, checkout separado do principal. A entrega não equivale a implantação nem a comprovação de precisão dos modelos.

## Entregue

- Capacidade `decision` no mesmo roteamento de chat/embedding, com principal, reservas ordenadas e escopos. Não herda chat nem aceita casos desconhecidos silenciosamente. Protocolo versionado `/api/alpha/decisions`; modelos informados por ID exato no Admin.
- Decisões de triagem, próxima ação e qualidade executadas pelo worker real de aprofundamento. Contexto textual limitado, critérios da campanha preservados e opções fornecidas pelo servidor. A decisão não inventa contatos, ferramentas ou URLs, não compra fora das autorizações e não dispensa qualidade mínima.
- Resposta protegida antes do parser, registro e custo por tentativa, fallback apenas em falha técnica confirmada. Dúvida válida não aciona fallback; timeout incerto não dispara nova compra. Recuperação de resposta salva e reentrega de tarefa não repetem a chamada.
- Autorização explícita e expiráveis para novas tentativas, com consumo único e política vigente. O teto aprovado não cresce com uma alteração posterior dos limites; uma nova compra autorizada recebe a cotação atual e conserva a anterior no histórico. Custo ausente é desconhecido, não zero.
- Calibração por modelo/snapshot/fornecedor/tarefa/versões/revisão/dataset. Mudança incompatível volta à observação. Exclusão depende de evidência institucional associada e calibração aprovada, é reversível e nunca apaga os fatos. Correção humana prevalece.
- Painel YUX com preços por modelo, estimativa em reais, limites de contexto/tempo, teste confirmado e aprovação administrativa de calibração. Salvar não testa. Somente Admin global acessa informações técnicas; cliente, administrador de conta e operador recebem a projeção comercial.

## Verificação executada

Ambiente: Windows, Node 22, Python 3.13 e PostgreSQL 17 em loopback. Todos os transportes externos são simulados. Não foram usados saldos ou chaves reais.

- Backend: 1.255 testes aprovados na suíte completa (126 condicionais pulados), verificação de tipos e build aprovados. A integração PostgreSQL foi executada separadamente: **74 testes em 11 arquivos**, todos aprovados. Os testes pulados não foram contados como prova de integração.
- Frontend: 1.164 testes aprovados; tipos, build e orçamento de bundle aprovados. `lint:baseline` passou com o passivo existente de 547 erros/25 avisos, sem aumento por assinatura. Isso não significa lint limpo.
- Runtime: 353 testes aprovados e sete condicionais pulados na execução sem banco. Seis testes adicionais de recibos foram executados com PostgreSQL real e papéis de serviço.
- Integração: jornada real entre backend, HTTP runtime, `yux_runtime` e banco; três etapas dentro do executor de uma empresa; fallback recebido inválido, timeout sem repetição, revalidação sem rede, autorização de retry consumida uma vez, cotação atual na nova compra, calibração, revisão humana, reinclusão e isolamento administrativo. Regressões de lotes, autorizações, reconciliação, identidade e projeção comercial também foram executadas no banco isolado.
- Migrações: 0217–0220 aplicadas no banco de pesquisa e no banco antes em 0216. Os modelos/provedores/status de todas as rotas antigas foram preservados; nome legado desconhecido permaneceu pendente; nenhuma decisão foi ativada. Manifesto de migrações verificado, com status de release ainda bloqueado.
- Navegador: cinco jornadas aprovadas em Chrome, desktop 1280×940 e celular 430×920. Salvar/reabrir conserva principal e fallback; seleção de etapa confere a rota correta; cotação é gratuita; teste exige confirmação. Três outras audiências recebem 403 na API técnica. Sem erros de página ou transbordamento horizontal observados. Fixture local encerrada após a validação.

## O que falta para usar em produção

1. Autorizar e fazer implantação coordenada de migrações, backend, worker, runtime e frontend da mesma revisão.
2. No Admin global, conferir integração OpenRouter, ID compatível atual do principal/reserva, preços, cotação e carteira do contrato; salvar e testar explicitamente. Não há modelo pago ativado por esta entrega.
3. Fazer piloto autorizado em observação. Aprovar limiares apenas com benchmark humano real no protocolo de produção. O teste sintético valida a integração, não a qualidade comercial; os rótulos E0 continuam pendentes.

Perplexity e a descoberta adaptativa completa C3.3/C4 não fazem parte desta conclusão. Não houve alteração no lote de produção, push, merge ou deploy. Instruções: [runbook de configuração](../../runbooks/radar-pesquisa-configuravel.md).

Evidências visuais locais desta máquina: `C:/Users/andre/AppData/Local/Temp/yux-radar-decisions-qa/decisions-1280.png` e `decisions-430.png` na mesma pasta. São dados sintéticos e não comprovam qualidade de modelo real.
