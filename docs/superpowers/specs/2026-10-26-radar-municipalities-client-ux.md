# Radar: municípios locais, cidades intuitivas e configuração interna

## Pedido e diagnóstico

O usuário autorizou corrigir/publicar a dependência da consulta online de municípios, informou ter removido o orçamento da campanha e acrescentou: herdar a UF quando só uma estiver selecionada e nunca expor ferramentas ao cliente. Execução direta preservada, sem subagentes nem chamadas pagas.

No lote `454410dc-1aee-4a5e-8b8d-5f9930915a09`, revisão 7, a primeira consulta para Bauru ficou incerta, sem resposta salva, após 5,044077 s. A consulta pública IBGE reproduziu TimeoutError em 5.003 ms no worker. O código reserva a fonte antes dessa preparação e descarta a mensagem original. Não existe prova persistida suficiente para declarar retroativamente que uma chamada antiga incerta não foi cobrada.

## Requisitos

- Resolver Cidade/UF usando catálogo oficial IBGE versionado e local, com todos os estados e municípios, não uma lista especial da campanha. Não depender de consulta online em runtime; não retirar o filtro municipal se faltar correspondência.
- Catálogo recuperado da API oficial nivelada em 26/10/2026: 5.571 municípios. Registrar origem, data e hash do conjunto canônico; script de atualização explícita valida sete dígitos, UF, unicidade e cobertura das 27 UFs antes de substituir o arquivo gerado. Sem novas dependências.
- Distinguir erros locais anteriores ao transporte de timeout/erro posterior ao envio. Somente prova tipada de não envio permite liberar reserva interna de custo/cota, atomicamente e uma vez. Preservar recibos antigos incertos e consentimento específico de nova tentativa.
- Campo de cidades aceita nomes sem `/UF` se houver exatamente uma UF selecionada. Preservar `Cidade/UF`; com várias/nenhuma UF, não adivinhar. UF explícita precisa estar selecionada; recusar formato ambíguo ou cidade vazia.
- Orientação e exibição das cidades existentes acompanham essa regra. Payload salvo continua `{city,state}`; não muda geografia ou revisão silenciosamente.
- Ferramentas, ordem, modelos, custos e detalhes operacionais somente para `yux_admin`, não operador/admin da conta/membro. Conferir UI e respostas HTTP/isolamento; manter funcionalidades técnicas em seções recolhidas e explicitamente administrativas. Não alterar nomes legítimos das empresas por substituição textual global.
- Não restabelecer orçamento removido pelo usuário, não aumentar cotas, não refazer descoberta nem executar consultas pagas. Publicação de código não comprova execução do lote real.

## Aceite

Busca cadastral por Bauru/SP em teste usa `address.municipality.in=3506003` sem chamar IBGE; Marília/SP, homônimos de UFs diferentes, código inválido e UF incorreta têm testes. Erro pré-envio não fica incerto nem consome reserva; erro após envio permanece incerto. Regressão com a mesma operação de 40 comprova autorização de recuperação, sem recriar lote e sem apagar o recibo original. Cidade sem sufixo salva UF única; controles internos e custos não são renderizados/entregues aos demais perfis.
