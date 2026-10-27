# Radar: pendências visíveis, aderência semântica e exclusões por campanha

## Objetivo

Concluir o fluxo comercial com situações compreensíveis por empresa, impedir que empresas comprovadamente incompatíveis ocupem a meta solicitada e permitir removê-las da campanha sem perder o histórico nem reenriquecê-las em rodadas seguintes. A solução é genérica para clientes e segmentos; não adicionar listas globais de palavras, ramos ou CNAEs para imitar uma análise semântica.

## Auditoria real de 27/10/2026 — somente leitura

Campanha Villeman `958f87b1-96a1-45b5-a095-d9e9eb623f67`, organização `972e8163-81b7-4e3f-b964-777110b660b8`, lote `454410dc-1aee-4a5e-8b8d-5f9930915a09`, revisão 7: 40 admitidas, zero em execução, 26 com lacunas, 14 falhas técnicas. `outsideProfile=0`; encontrar 40 nomes não comprovou 40 empresas aderentes.

| Motivo salvo | Quantidade | Empresas | Conduta necessária |
|---|---:|---|---|
| `radar_presence_unverifiable` | 10 | Malibu Presidente Prudente; JR MARILIA HOTEIS; Alves Hotel; Villa Tomilho Buffet Eventos; Cedro do Libano; Dom Apetite; Buffet Caversan; H T Comercial; Aex Alimenta; Peter Alimentos | Explicar identificação do site não concluída; 10 respostas recebidas e inválidas estão salvas. Revalidar sem geração quando possível; se não for possível recuperar, exigir autorização específica para nova chamada. Não confirmar site/contatos com citações inválidas. |
| `radar_qualification_unverifiable_claim` | 2 | COMPRANDO-NACIONAIS E IMPORTADOS; BDL Alimentação | Explicar análise comercial não concluída. As respostas também estão salvas e inválidas; não aprovar afirmações sem suporte para zerar a pendência. |
| `radar_research_call_uncertain` | 1 | Rosamar - Comercio de Alimentos | Tentativa anterior sem conclusão confirmada; não há resposta revalidável. Nova tentativa depende de autorização explícita. |
| `radar_research_previous_request_failed` | 1 | MANGARDEN RESTAURANTE E BUFFET | Explicar falha em pesquisa complementar; saída registra `radar_funnel_action_failed`. Exibir a etapa e a ação elegível, sem confundir ausência normal de informação com falha de execução. |

Observações adicionais:

- A análise semântica atual já devolveu `not_target` para **Gali Energia** e **Chafariz higiene**, com site associado, evidências e atividade incompatível descrita. Entretanto, os candidatos continuam `pending_review`, são mostrados na operação e não entram em `outsideProfile`. Falta aplicar uma conclusão já existente, além de melhorar a triagem.
- G1/G5 permanecem em `shadow`. Resultados `outside_profile` desses portões não excluem; não declarar calibração aprovada nem converter probabilidades não calibradas em exclusão automática.
- Cinco dos 14 casos têm G5 `decision_limit_reached`; um tem `decision_version_superseded`. O orçamento de escolhas intermediárias pode impedir uma avaliação final.
- A mensagem pública de bloqueio é constante em `commercial-view.ts` e `RadarCaptureProgress.tsx`. A listagem não carrega um estado comercial de execução correspondente ao resumo do lote.
- `discardRadarCandidate` já preserva o candidato com `status='discarded'`, mas a consulta de candidatos não o oculta por padrão; falta ação em lote e uma garantia de supressão por identidade em todos os caminhos de entrada.

## Comportamentos exigidos

### 1. Pendência e ação visíveis

Lista, resumo expandido e detalhe completo mostram o mesmo estado, a etapa incompleta, o motivo comercial e a próxima ação elegível. Estados: em pesquisa; aguardando retomada; pesquisada com lacunas; aderente; fora do público; excluída desta campanha.

O resumo agrupa as 14 pendências por motivo e permite abrir a lista já filtrada. Uma empresa sem site/telefone encontrado pode estar pesquisada com lacunas; isso não a transforma automaticamente em uma execução travada. Um clique em retomar informa quais etapas avançaram e quais requerem revisão/autorização, sem repetir uma resposta incerta.

Exemplo público: “Identificação do site não concluída. Os dados encontrados foram preservados.” O cliente não recebe provedor, modelo, recibo, tokens, custo, código de erro ou diagnóstico de infraestrutura. O Admin YUX mantém o diagnóstico completo em área técnica própria.

### 2. Aderência semântica com efeito real

Uma conclusão semântica válida e vinculada à identidade, critérios e revisão atuais deve produzir resultado comercial canônico. `not_target` com evidência positiva de incompatibilidade vira fora do público, sai da lista principal, não é elegível a novo envio ao CRM e não ocupa a meta de empresas aderentes. `review/insufficient`, ausência de palavras ou nome sugestivo não comprovam incompatibilidade.

Reutilizar a qualificação estruturada já existente e seu roteamento pelo Admin. Fazer a verificação compacta assim que houver evidência suficiente, antes de investigação cara; se não houver, consultar informação pública pertinente e investigar. Reusar a conclusão no final enquanto a identidade, critérios e evidências relevantes não mudarem. Manter um exame final semântico obrigatório; escolhas opcionais de ferramenta não podem consumir a capacidade reservada à conclusão comercial. Não criar outro fornecedor/serviço nem trocar modelo nesta entrega.

Não desativar as proteções de calibração dos portões probabilísticos. A conclusão comercial categórica, fundamentada e reversível da qualificação existente é distinta de aceitar um escore de decisão não calibrado. Toda exclusão guarda origem e fundamento; a falta de prova continua revisão, não aprovação nem exclusão inventada.

Para buscas novas, a meta N representa N empresas aderentes, mesmo que alguma não publique um contato opcional. Fora do público, exclusões manuais, duplicatas e análise inconclusiva não preenchem essa meta. Custos e quotas continuam respeitados; se não houver capacidade ou empresas suficientes, mostrar o saldo e a causa real. Não alterar silenciosamente a contagem congelada do lote antigo de 40 nem iniciar reposição paga a partir de mera correção de projeção. A migração desse lote para uma meta de 40 aderentes deve ser uma ação explícita e auditada.

### 3. Excluir desta campanha

Botão individual e em lote “Excluir da campanha”. A empresa sai da lista principal, mas permanece em “Excluídas desta campanha”, com origem, motivo, data e opção explícita de restaurar para revisão.

O registro de exclusão manual é durável por organização + campanha + identidade; independe da revisão dos critérios. Preferir CNPJ verificado e chaves canônicas existentes. Sem CNPJ, usar associação já corroborada (identidade externa ou nome + localização + domínio), sem banir homônimos por nome isolado. Manter o registro mesmo se o candidato for limpo posteriormente. A exclusão semântica vale para os critérios/revisão que a fundamentaram; revisão dos critérios exige nova avaliação, não aprovação automática.

Verificar a exclusão antes de admissão, lookup/enriquecimento pago, enfileiramento e publicação do resultado. Resultado de chamada já em andamento pode terminar e ter cobrança; preservar o recibo, mas não reinserir a empresa nem iniciar etapas novas. Uma página comprada pode conter uma empresa excluída; descartá-la localmente antes de novo enriquecimento e sem contá-la como resultado novo.

Não aplicar a supressão a outras campanhas, nem ao duplicar uma campanha. Não apagar o cadastro global ou um lead já entregue ao CRM. Restaurar não refaz pesquisa nem concede aprovação comercial automaticamente.

## Critérios de aceite

- As 14 pendências atuais são identificáveis e filtráveis pela mesma causa no resumo, na linha e no detalhe. Retomar não pode aparentar sucesso sem avanço ou motivo.
- Gali Energia não ocupa resultado aderente quando a evidência da própria empresa comprova atividade incompatível. Chafariz exige preservar a checagem de identidade/homônimo; o nome “higiene” isolado não é prova.
- Empresas que de fato oferecem refeições coletivas continuam elegíveis mesmo com nome contendo energia, higiene ou importação. Um segmento diferente, em outra campanha, funciona com a mesma lógica, sem alterar código.
- Uma empresa manualmente excluída não volta à mesma campanha por CNPJ, outra fonte, alias corroborado, repetição de página, revisão de critérios ou retomada de worker. Continua elegível em outra campanha da mesma organização.
- Respostas salvas, despesas e histórico não são apagados; nenhum efeito incerto é recomprado para encerrar artificialmente o lote.
- Testes HTTP e de interface abrangem `yux_admin`, `yux_operator`, `client_admin`, `client_member` e isolamento entre organizações.

## Execução e publicação

Execução direta nesta sessão, sem subagentes, preservando a preferência já fornecida. Desenvolvimento e testes usam serviços simulados. Revisar o plano antes de implementar. Publicação na main, deploy automático e qualquer reavaliação paga em produção são atos distintos: o plano deve tornar cada um explícito; nenhum deles ocorreu nesta auditoria.
