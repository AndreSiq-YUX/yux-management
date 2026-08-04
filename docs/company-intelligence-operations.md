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

Confirme que `0125_company_intelligence_hub.sql` aparece na listagem.

## Uso pelo Crescimento YUX

1. Entre em **Crescimento YUX** e abra **Empresa > Perfil**.
2. Preencha descrição, site, setor, posicionamento, diferenciais, contatos e regiões atendidas.
3. Abra **Empresa > Marca e tom de voz** e configure tom, persona, vocabulário recomendado, o que não falar, temas proibidos e observações de conformidade.
4. Abra **Empresa > Base de conhecimento**.
5. Cadastre conteúdo por texto, importe uma URL ou envie PDF, DOCX, TXT e Markdown.
6. Aguarde a indexação, revise o texto extraído, ajuste visibilidade e perfis de agente e publique explicitamente.

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
- A busca textual e o ranking por termos estão ativos. Embeddings vetoriais continuam opcionais até a infraestrutura usar pgvector.
- Se a indexação falhar, o documento permanece fora de publicação e exibe o erro. Corrija a origem ou o volume compartilhado e envie/importa novamente.
- URL importa somente a página informada; não há crawler de links nesta entrega.
