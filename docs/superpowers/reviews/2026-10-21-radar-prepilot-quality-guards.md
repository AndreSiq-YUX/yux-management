# Radar — verificação das correções pré-piloto

Branch: `codex/radar-prepilot-quality-guards`, base `b1f9e4e`.

## Comportamentos corrigidos

1. **Orçamento:** novas reservas Agent consideram o gasto/reservas BRL cumulativo da campanha, de todas as fontes e dias, sob o mesmo bloqueio transacional das buscas. O teto USD próprio do Agent continua independente. Saldo zero impede nova compra; teto nulo não limita BRL; resposta já salva continua recuperável. Custos desconhecidos conservam a reserva. Custo real acima da estimativa impede próximas compras, mas não constitui garantia de teto remoto do provedor.
2. **Descoberta:** identidade explicitamente inconclusiva deixa de tratar a mera menção do nome como motivo para parar. As páginas avaliadas são identificadas por URL e conteúdo, sem horário de observação. Consultas ainda não realizadas podem prosseguir dentro das quotas existentes; fatos e recibos permanecem salvos. Falha técnica ou efeito incerto não é convertido em autorização para nova compra.
3. **Relatório:** total por motivo/etapa, última classificação de cada portão por empresa e probabilidades brutas do request exato. Sem limiar histórico registrado, o contrafactual é `null`/“Não avaliável”, não um falso zero. Revisões posteriores não alteram a interpretação de eventos anteriores; relatório de lote continua ligado ao respectivo run. CSV contém resumo e decisões, com proteção contra fórmulas de planilha. Somente Admin global acessa esses dados.
4. **CNAE:** teste de arquitetura detecta códigos formatados fixos e literais numéricos de políticas CNAE nos arquivos produtivos Radar; não proíbe regex de validação, números não relacionados, catálogo ou configuração da campanha.

## Evidências locais

- Backend: **1.388 testes passaram**, 126 opt-in ignorados; 265 arquivos passaram, 5 ignorados.
- PostgreSQL isolado: **150 integrações Radar passaram**, 29 arquivos. Transporte de provedores simulado, incluindo concorrência, reserva antes do efeito, gastos históricos, limite exato e recuperação.
- Frontend: **1.176 testes passaram**, 217 arquivos.
- Runtime Python: **375 passaram**, 7 opt-in ignorados; aviso de depreciação preexistente do Starlette/AnyIO.
- Tipos/build backend e frontend, orçamento do bundle e `git diff --check`: aprovados.
- Lint sem nova dívida: 547 erros/25 avisos preexistentes, abaixo da referência 560/27; arquivos frontend alterados sem erros.

## Interface real

Ambiente: API e PostgreSQL sintéticos em loopback, Vite `http://127.0.0.1:4174`, Chrome headless/Playwright já instalado (Browser plugin não listado no catálogo de skills). Fluxo: login Admin → Integrações → relatório da campanha → atualizar histórico → abrir empresas → exportar CSV; depois login cliente → critérios comerciais.

| Verificação | Desktop 1280×940 | Mobile 430×940 |
|---|---|---|
| Página correta / conteúdo não vazio | passou | passou |
| Sem overlay ou erro de aplicação | passou | passou |
| Resumo, probabilidade e “Não avaliável” | passou | passou |
| Atualização e download CSV | passou | passou |
| Sem transbordamento horizontal | passou | passou |
| Cliente sem dados técnicos | passou | passou |
| Nenhuma ação paga disparada | passou | passou |

Recursos externos foram deliberadamente bloqueados. O 401 inicial de `/auth/me` antes do login é esperado; demais respostas HTTP não tiveram erro. Capturas e rastros locais em `C:/Users/andre/AppData/Local/Temp/yux-radar-prepilot-qa-20261021`.

## Escopo e limites da validação

Nenhuma configuração ou dado de produção foi alterado nesta execução. Nenhuma chamada paga, piloto, deploy ou push foi realizado. A confirmação anterior do deploy `b1f9e4e` e das migrações 0228–0234 não equivale à publicação desta branch. Estas correções não exigem migração adicional. Benchmark/calibração e teste pago real permanecem etapas posteriores autorizáveis; não declarar precisão da IA nem orçamento numérico de produção como verificados.

## Revisão independente e decisões

Revisão read-only da branch completa por contexto independente (`gpt-6-astra`, high) em `805d5db`: nenhum crítico ou menor; dois achados importantes, corrigidos numa única rodada de testes RED→GREEN:

- **Histórico de calibração:** um pedido pode ser recuperado e reaplicado depois de mudar a calibração. O snapshot agora inclui a identidade do evento, não somente o request; somente a aplicação exata pode emprestar seu limiar ao relatório. Caso antigo sem vínculo permanece desconhecido. Cobertura unitária e integração PostgreSQL exercitam o mesmo request antes/depois da calibração.
- **Guarda CNAE:** passou a detectar comparações diretas, `includes`, `Set.has` e `switch` envolvendo CNAE, além dos literais em políticas nomeadas. Os quatro casos falharam antes e passaram depois.

Decisões de escopo registradas:

1. Estender o tipo já existente em `funnel-discovery.ts`, em vez de criar o arquivo de tipos inexistente citado no plano. Risco: apenas localização/organização do contrato, sem alteração de dados.
2. Teto BRL compartilhado cobre buscas e Agent; presença, qualificação e decisões preservam suas carteiras e recibos próprios. Risco: essas outras IAs exigem limite de carteira para conter gasto e não estão cobertas pelo teto BRL das buscas.
3. Não testar cobrança real ou precisão de identificação sem autorização de compra/piloto e benchmark. Risco remanescente: ajustes de custo/modelo podem ser necessários depois do teste real autorizado.

Nenhum achado menor adiado. Nenhuma segunda revisão foi disparada; a rodada de correções foi verificada por testes direcionados e pelas suites gerais.
