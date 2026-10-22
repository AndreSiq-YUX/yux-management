# Radar: fluxo completo por padrão e documento operacional

Pedido de 22/10/2026: o Radar é produto da plataforma, não solução exclusiva da Villeman. Novas campanhas devem começar com o fluxo completo; documentar funcionalidades e execução para integração futura com o Action Engine, a cargo de outra frente.

## Requisitos

- Criação padrão na UI e API: descoberta adaptativa, funil, triagem em observação, decisão de próxima ação efetiva, identificação, leitura, contatos/redes públicas, qualificação e perfil habilitados. Investigação profunda é escalada por necessidade e capacidade, não chamada obrigatória em toda empresa.
- Observação sem calibração não exclui automaticamente. Não ativar modelos/provedores, conceder licença, inventar crédito ou aumentar cotas globais.
- Valores explicitamente configurados pelo Admin continuam respeitados; opções omitidas na criação não podem receber defaults legados desativados.
- Leitura/edição de campanhas e lotes antigos conserva sua configuração e consentimento. Sem migração automática de campanha ou nova pesquisa.
- Criação rápida local deve usar a mesma campanha configurável e pipeline completo, representando a cidade nos filtros. Preservar a intenção de empresas recém-abertas como filtro de abertura, não como fluxo de menor qualidade.
- Duplicação mantém filtros e capacidades, mas não reutiliza calibração aprovada de outra campanha.
- Não integrar ações do Radar ao Action Engine, não ingerir conhecimento nem disparar IA nesta entrega. Escrever guia comercial e referência técnica de execução separados por audiência.
- Explicar escala: limites globais de política são tetos de configuração; cotas por organização/fonte somam campanhas; orçamento pertence à campanha; credenciais/saldo de fornecedores podem ser compartilhados na plataforma.

## Aceite

- Duas campanhas novas, em segmentos e contas diferentes, recebem o mesmo conjunto de etapas, sem CNAE, cidade ou ID Villeman fixos.
- Payloads sem configuração ou com configuração parcial recebem o padrão completo; valores explícitos do Admin, erros de schema e permissões não são ocultados.
- Campanha existente com etapas desativadas não é ativada ao ler/salvar outro campo.
- Criação e duplicação não executam pesquisas; nova cópia de campanha calibrada começa sem exclusão automática.
- Testes sem fornecedores pagos cobrem backend, formulário, caminho local e audiência HTTP; builds passam.
- Guia explica parâmetros, ações, estados, qualidade, cotas, fluxo e limitações de automação; documento técnico lista endpoints e controles reais sem afirmar integração executável existente.
