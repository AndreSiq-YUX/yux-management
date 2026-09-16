# Administração central de LLMs

A página **Admin → IA/LLM** (`/admin/ai`) concentra credenciais de provedores e rotas de modelos. A antiga aba de modelos do Strategy Engine apenas encaminha para esta página; os perfis e vínculos dos assistentes continuam no Strategy Engine.

## Escolha de modelos

- Selecione uma função no catálogo. Há rotas para Action Engine, supervisor, especialistas de campanhas/funis, curadorias, embeddings, ações de IA das automações e todos os perfis estratégicos/conversacionais.
- Informe provedor e modelo principal. Adicione os fallbacks manualmente; a ordem exibida é a ordem de tentativa. É possível alternar entre OpenRouter e OpenAI direta.
- Salvar uma **rota ativa** autoriza o uso dos modelos nela informados. O sistema não escolhe automaticamente novos modelos pagos.
- As chaves de API permanecem criptografadas no servidor. Configurações e segredos passam a valer na próxima execução.
- O teste de modelo só ocorre ao clicar e confirmar o botão; pode consumir créditos. Salve alterações antes de testar.

## Herança e contingência

A execução escolhe o override correspondente ao escopo/faixa e a configuração da função, tenta seu modelo principal e os fallbacks próprios e, se o provedor falhar, tenta a configuração global compatível.

- **Global de texto** é o padrão sem configuração específica e a reserva final de chamadas de texto.
- **Global de embeddings** é uma reserva separada, nunca substituída pelo global de texto.
- Especialistas sem rota própria mantêm a rota do supervisor.
- Ações de classificação de leads, geração de mensagens e geração de propostas sem rota própria mantêm a rota do perfil da automação.
- O WhatsApp continua usando o perfil vinculado ao assistente. O vínculo e as regras de atendimento não mudam com a centralização dos modelos.
- Uma rota explicitamente pausada/arquivada bloqueia seu uso, sem reativação silenciosa pelo ambiente. Uma negação de autorização de modelo pago não pode ser contornada por fallback.

## Rotas existentes e ambiente legado

Rotas salvas, seus tiers e escopos não são excluídos. Use **Rota e escopo** para editar uma rota específica ou criar um novo override. O identificador/escopo de uma rota existente fica fixo; para outro escopo, crie outra rota.

Enquanto não houver configuração explícita aplicável, modelos legados do ambiente podem continuar em uso. O painel consulta o runtime para exibi-los com origem **Legado do ambiente**. Salvar os dados transfere a escolha para a configuração persistida pelo Admin. Se o runtime não puder ser consultado, o painel avisa que o modelo legado não foi confirmado; não interpreta um campo vazio como ausência de uso.

## Embeddings

Ingestão e busca compartilham a rota `knowledge_embeddings`. Cada lote completo usa um único modelo. Um fallback reinicia o lote, sem misturar espaços vetoriais. Consultas filtram a identidade efetiva do modelo e a dimensão do vetor.

Trocar de modelo exige reindexação para manter cobertura semântica dos documentos antigos. Os índices anteriores não são apagados. Essa alteração não dispara reindexação paga automaticamente. A configuração do painel trabalha com modelos compatíveis com 1024 dimensões.

## Teste após implantação

1. Confira e salve as credenciais dos provedores desejados.
2. Confira as rotas que vieram do ambiente e salve explicitamente as escolhas que deseja manter.
3. Configure as reservas globais e os fallbacks por função.
4. Faça um teste confirmado do principal e confira o resultado.
5. Execute uma conversa estratégica/automação de teste e confira o modelo efetivamente registrado na execução. Testes funcionais que chamem modelos pagos dependem de sua escolha/autorização.
