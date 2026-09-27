# Radar — primeira etapa de fontes brasileiras

Recorte de implementação da primeira etapa em 27/09/2026, derivado do plano `2026-09-27-radar-fontes-confiaveis-enriquecimento-diagnostico.md` e da especificação `2026-09-26-radar-prospeccao-orquestrada.md`. O usuário aprovou o plano maior e adiou explicitamente scraping/crawl; este recorte não substitui nem declara concluídas as demais tarefas do plano maior.

## Decisões de escopo

- Integrar CNPJá existente, Serper Places e Brave Place Search, com credenciais no Admin e execução restrita à organização interna da YUX.
- Serper e Brave ficam desligados até o Admin cadastrar as chaves e habilitar um canário. A busca é visualização transitória, sem salvar respostas, IDs, candidatos ou registros no CRM. Direitos de retenção ainda não foram confirmados.
- Não executar chamadas externas durante o desenvolvimento; testes usam respostas simuladas. Não executar scraping ou crawl de sites nesta etapa.
- A descoberta é neutra quanto à oferta; ausência de site na resposta significa desconhecido, não inexistente.
- Não acionar análise por LLM, mensagens, CRM ou fluxos de contato automaticamente.

## Tarefas

### Task 1: CNPJá e controles

- Testar primeiro bloqueio de fonte para papel/organização indevidos e custo por chamada, mesmo com zero resultados.
- Testar primeiro normalização de endereço, situação, atividades e status de site desconhecido.
- Implementar controles e normalização sem expor dados de sócios.

### Task 2: Adaptadores de busca local

- Testar primeiro requests para Serper e Brave com Brasil/português e limite até dez, normalização sem inferir ausência, erro e timeout.
- Implementar adaptadores e testes somente com HTTP simulado.

### Task 3: Execução transitória e Admin

- Testar primeiro escopo interno, fonte desligada, credencial ausente, limite e não persistência de resultados.
- Integrar rotas, catálogo, credenciais protegidas, formulário de consulta e visualização transitória.
- Testar manualmente as rotas com fixtures; não gastar créditos.

### Task 4: Verificação e entrega

- Rodar testes específicos, suites completas, checagem de tipos e builds.
- Revisar diff completo, corrigir falhas importantes, registrar limitações e preparar commit.

## Adiado por decisão do usuário

Leitura/crawl de site e scraping de buscadores foram adiados explicitamente pelo usuário. Enriquecimento pós-captura, diagnóstico aprofundado e conversão ao CRM **continuam pendentes** no plano maior e dependem de evidências persistíveis suficientes para ter qualidade. A ativação comercial de Serper/Brave e a persistência de seus dados exigem decisão separada sobre termos, custo e licença.
