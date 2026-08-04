# Inteligência da empresa: operação e validação

Atualizado em 2026-08-04.

## O que está conectado

O perfil da empresa, a marca e a base de conhecimento são mantidos por organização. O mesmo contexto é carregado pelo Agent Harness para Marketing Studio, Radar, ações de IA das automações e conversas externas, incluindo WhatsApp.

Somente conteúdos publicados entram no contexto dos agentes. A visibilidade do documento controla se ele pode ser usado em canais externos, e as listas de perfis permitidos ou bloqueados restringem agentes específicos. Regras de marca e segurança continuam obrigatórias mesmo quando um chamador fornece contexto adicional.

No WhatsApp existe uma proteção adicional após a geração. Respostas que contenham vocabulário proibido ou temas bloqueados não são enviadas automaticamente; a mensagem fica bloqueada e a conversa é encaminhada para atendimento humano.

## Configuração da VPS

Defina `KNOWLEDGE_STORAGE_DIR=/app/storage/company-knowledge`. Os serviços `yux-backend-api` e `yux-backend-worker` precisam montar o mesmo volume persistente nesse caminho. O arquivo `docker-compose.dokploy.yml` já declara o volume `yux_company_knowledge_data` para ambos.

Depois do deploy da imagem nova, aplique as migrations:

```bash
docker exec -i "$(docker ps --format '{{.Names}}' | grep 'yux-backend-api' | head -n 1)" npm run migrate:prod
```

Para conferir o histórico registrado pelo migrador:

```bash
docker exec -i "$(docker ps --format '{{.Names}}' | grep 'yux-backend-api' | head -n 1)" node -e "const{Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const r=await c.query('SELECT version, applied_at FROM public.schema_migrations ORDER BY version');console.table(r.rows);await c.end()})().catch(e=>{console.error(e);process.exit(1)})"
```

Confirme que `0125_company_intelligence_hub.sql` e
`0126_intelligent_knowledge_pipeline.sql` aparecem na listagem.

Também configure nos serviços indicados pelo `docker-compose.dokploy.yml`:

- `OPENROUTER_API_KEY` no Agent Harness, para curadoria e extração estruturada;
- `KNOWLEDGE_CURATION_MODEL` (padrão `openai/gpt-4.1-mini`);
- `JINA_API_KEY` no backend worker e no Agent Harness;
- `JINA_EMBEDDING_MODEL` (padrão `jina-embeddings-v3`);
- `JINA_EMBEDDING_DIMENSIONS` (padrão `1024`);
- `KNOWLEDGE_CURATION_ENABLED=true`;
- `KNOWLEDGE_CURATION_MAX_BATCH_CHARS=12000`;
- `KNOWLEDGE_WEBSITE_MAX_PAGES=10`;
- `YUX_AGENT_RUNTIME_URL` e o mesmo `YUX_AGENT_RUNTIME_TOKEN` no backend,
  worker e Agent Harness.

## Uso pelo Crescimento YUX

1. Entre em **Crescimento YUX** e abra **Empresa > Perfil**.
2. Informe o site em **Preencher com o site**, aguarde a leitura e revise cada
   sugestão com sua evidência e página de origem. Aplique somente as desejadas.
3. Complete manualmente descrição, setor, posicionamento, diferenciais,
   contatos e regiões atendidas que o site não informou.
4. Abra **Empresa > Marca e tom de voz** e configure tom, persona, vocabulário
   recomendado, o que não falar, temas proibidos e observações de conformidade.
   Bloqueios e compliance nunca são inferidos automaticamente do site.
5. Abra **Empresa > Base de conhecimento**.
6. Cadastre conteúdo por texto, importe uma URL ou envie PDF, DOCX, TXT e Markdown.
7. Aguarde a preparação inteligente, aprove ou rejeite cada fato proposto,
   ajuste visibilidade e perfis de agente e publique explicitamente.

Arquivar é recuperável e substitui exclusão destrutiva. Um arquivo duplicado ativo, identificado por SHA-256 dentro da organização, é rejeitado.

## Teste de ponta a ponta

1. Publique um texto manual com uma expressão exclusiva.
2. Importe uma página do site e publique depois da extração.
3. Envie um PDF ou DOCX, confira o preview e publique.
4. Execute um workflow do Marketing Strategist e confira no trace os IDs das fontes usadas.
5. Execute uma análise do Radar e confira a mesma identificação de organização, cliente e contrato.
6. Execute uma ação de automação `ai_generate_message` com um perfil de agente definido.
7. Envie uma mensagem pelo número de WhatsApp de teste e confirme o tom da resposta.
8. Provoque uma expressão cadastrada em **O que não falar**: a resposta deve ficar bloqueada, sem despacho automático, e deve haver handoff.
9. Repita a consulta em outra organização e confirme que nenhum conteúdo da YUX aparece.

## Limites e recuperação

- O limite padrão é 10 MB por arquivo, respeitando a configuração global/da organização existente.
- A requisição HTTP aceita no máximo 25 MB para acomodar o arquivo codificado em base64.
- O original é preservado em chunks brutos para auditoria. A publicação normal
  substitui o corpo consumido pelos agentes pelos itens curados e aprovados.
- A busca híbrida combina similaridade dos embeddings Jina armazenados em
  JSONB, relevância textual e qualidade. Não depende de pgvector e mantém
  fallback textual se a Jina estiver indisponível.
- Falhas de extração impedem a publicação. Falhas somente de LLM/embedding
  deixam o processamento degradado e exigem confirmação explícita para publicar
  o texto original.
- O preenchimento pelo site lê no máximo 20 páginas do mesmo domínio (10 por
  padrão), priorizando páginas institucionais, produtos, serviços e contato.
  Endereços locais/privados são bloqueados antes da leitura.
