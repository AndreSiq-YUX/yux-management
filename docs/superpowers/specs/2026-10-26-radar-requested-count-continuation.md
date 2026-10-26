# Radar — continuidade até a quantidade solicitada

O lote Villeman `454410dc-1aee-4a5e-8b8d-5f9930915a09` solicitou 40 empresas e parou com 10: oito resultados com lacunas e duas falhas individuais. O banco confirmou `discovering`, nenhuma lease ativa e nenhuma linha na outbox; os processadores estavam saudáveis. A decisão de descoberta também interrompe toda a campanha quando encontra uma empresa aguardando atenção.

## Comportamento autorizado

- Uma falha individual não impede descobrir e pesquisar as empresas restantes do pedido original. Todas as novas admissões continuam pelo fluxo completo. Manter a contagem congelada do lote: admissão no legado/funil; empresas qualificadas no v2 sem funil. Duplicatas e registros descartados não ganham contagem fictícia.
- Lotes ativos sem agendamento devem ter sua continuidade recuperada pela manutenção existente, com isolamento por organização, revisão vigente, campanha permitida e usuário solicitante ainda autorizado. A recuperação altera apenas estado/agendamento; não repete análises individuais nem compra outra descoberta da página anterior.
- Preserve integralmente chamadas incertas, recibos, consentimentos e empresas já encontradas. Pendência individual permanece identificável e retomável quando a descoberta termina; não deve produzir atividade aparente sem trabalho agendado.
- Uma continuação vencida/rejeitada aguarda autorização apenas na região correspondente. Outras regiões configuradas e ainda utilizáveis podem continuar o pedido original. Se só restarem continuações pendentes, mostrar a necessidade de confirmação; descoberta com cobrança incerta mantém a proteção global existente.
- O pedido não altera orçamento, cotas, serviços, modelos, regras de descarte ou autorizações anteriores. Ausência real de resultados, limite financeiro, falta de crédito, autorização pendente ou descoberta incerta continuam impedimentos explícitos; não é possível fabricar a quantidade desejada.
- Não reabrir lotes parciais/concluídos, históricos encerrados, pausados por decisão/erro global, de revisão antiga, campanha suspensa ou solicitante sem autorização. Não consultar outra organização fora do contexto permitido.
- A audiência continua a mesma: apenas `yux_admin` recebe diagnóstico técnico; clientes recebem resultados comerciais. Nenhuma mudança de DTO é necessária.

## Aceite

Reproduzir 10/40 com oito lacunas e dois bloqueios individuais em Postgres real, sem outbox. A manutenção deve reagendar a mesma operação; o dispatcher e os workers devem completar mais três páginas até 40, sem comprar uma quinta página, repetir chamadas incertas ou criar outro lote. Repetição/concorrência da manutenção é idempotente. Descoberta incerta e limites globais ainda bloqueiam com estado verdadeiro. Executar suites e builds; publicar a correção e conferir o deploy e a recuperação do lote existente dentro das autorizações originais.
