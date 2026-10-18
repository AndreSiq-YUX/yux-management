# Radar: continuidade, limites administrativos e preservação do portal

## Pedido

Resolver a continuidade de descoberta e aprofundamento de empresas existentes/novas, tornar os tetos operacionais do Radar editáveis no Admin e verificar regressões em outras áreas. Preservar dados, histórico, custos, funcionalidades e o padrão visual atual. Testes de desenvolvimento não podem consumir APIs ou modelos pagos.

## Evidências de 18/10/2026 — somente leitura

- `main` e a branch de correções apontam para `b3151b21a451cc283687514930064e4009021fe1`.
- Dokploy seleciona `feat/portal-identidade-visual`, com implantação concluída de `03244fb4a17d3b103bfeccc0a33eb695ea45fc32`. A base comum dessa branch com main é `f85be39`; ela não inclui as correções posteriores de continuidade, capacidade e compatibilidade de recibos. Não inferir que uma publicação em main chegou à produção.
- A interface visual tem alterações próprias em aproximadamente 320 arquivos; não substituir essa branch pela versão anterior de main nem copiar arquivos de uma versão sobre a outra.
- A campanha salva está na revisão 6, com 10 empresas/página, 10 páginas/região, 100 consultas/lote, verificação de 25 e limite diário 500.
- Depois de reiniciar a descoberta, o lote antigo fez três páginas bem-sucedidas por volta de 00h41–00h42, sem novas admissões. Uma tentativa em outro lote às 10h45 herdou continuação dessa sequência e recebeu HTTP 400 com rejeição explícita do token de paginação. Isso não demonstra erro na chave de autenticação.
- O código em main já possui consentimento vinculado ao recibo para reiniciar continuações rejeitadas. A versão visual implantada não contém toda essa recuperação e não informa `canContinue` na resposta do lote.
- A validade exata do token não foi estabelecida pela documentação consultada. Não inventar um TTL do provedor. A documentação oficial exige que token de paginação seja enviado sem os filtros iniciais; o adaptador atual já faz isso.
- O limite local de 10 registros por página não deve ser apresentado como máximo comprovado da API: a referência oficial contém exemplo com `limit: 100`. A mudança de tamanho exige conferir contagem de consumo, pois o SDK oficial descreve cobrança em blocos de 10 estabelecimentos.

Referências primárias: [SDK oficial](https://github.com/cnpja/sdk-nodejs#pesquisa-cnpj) e [referência oficial publicada pelo CNPJá](https://www.postman.com/cnpja-api/cnpj/documentation/wm96pex/cnpj-referncia-da-api).

## Entrega proposta

### Integração e implantação

Consolidar o portal visual e main em uma linha de publicação, com autorização do usuário antes de alterar branches compartilhadas. Fazer merge em checkout isolado, preservar as duas histórias e testar conflitos; não resetar, sobrescrever ou fazer force-push. Publicação, implantação e piloto pago são etapas distintas. O deploy futuro deverá selecionar explicitamente o commit consolidado.

### Continuação como estado durável

- O início de um lote não deve comprar uma chamada usando token já rejeitado na mesma campanha/revisão/região. A verificação deve ocorrer novamente sob lock na reserva, não só na interface.
- Registrar data de obtenção do token separadamente de `updated_at`, geração do cursor e invalidação com recibo. Não adivinhar a data de emissão de tokens legados; tratar idade desconhecida explicitamente.
- Uma idade máxima administrativa é uma política de precaução, não validade garantida do provedor. Padrão proposto: 60 minutos sem nova página, editável no Admin. Ao exceder ou faltar data confiável, exigir confirmação antes da chamada; não descartar resultados automaticamente.
- Reinício exige aprovação vinculada à organização, campanha, revisão, região, geração do cursor e estado/recibo exibido. Registrar quem autorizou. Nunca aplicar confirmação antiga a um token mais recente.
- Timeout, resposta desconhecida ou falha de persistência não autorizam repetição automática. HTTP 400/422 genérico também não autoriza descartar continuação sem evidência específica.
- Guardar registros das páginas recebidas e usar overflow já pago. Contar duplicatas separadamente de empresas novas e considerar a necessidade de revisitar páginas na orientação de capacidade. Não prometer quantidade quando a fonte se esgotar.
- Lotes parciais por limite permanecem retomáveis. Alterar limites da campanha não muda silenciosamente a autorização de um lote em andamento: oferecer adoção explícita, no mesmo diálogo, mantendo objetivo e critérios.

### Limites operacionais administráveis

Adicionar uma política global versionada e auditada, restrita a `yux_admin`, na área existente Admin → Integrações → Radar. A política define os tetos que as campanhas podem escolher, não altera configurações de clientes nem começa pesquisas ao salvar.

Campos: empresas novas por lote; páginas por região; consultas de descoberta por lote; tamanho da página de descoberta; empresas por lote de verificação; consultas por empresa; páginas públicas por empresa; consultas diárias por campanha; consultas diárias por fonte; validade da pesquisa; idade máxima administrativa da continuação. Manter os valores atuais como padrões, exceto a nova precaução de 60 minutos, que será explicitamente revista pelo usuário.

Não espalhar novos números em Zod, inputs e workers. Usar validação estrutural de inteiros seguros/positivos e validação operacional com a política carregada do backend. Valores já autorizados para lotes existentes permanecem identificáveis; mudanças globais não devem cancelar ou aumentar consumo de um lote silenciosamente.

Restrições de transporte, rede pública, TLS, SSRF, robots, tamanhos de resposta, leases, idempotência, credenciais e direitos de entrega não são controles comerciais de volume. Preservá-las; não oferecer switches para desabilitá-las nesta tarefa. Restrições efetivas de cada endpoint continuam aplicáveis; configurar um número no Admin não altera o contrato do provedor.

Se tamanho de página maior for habilitado, separar quantidade de chamadas de unidades cobradas. Reservar o custo equivalente ao volume máximo da página herdada pelo token antes da chamada, preservar excedentes no overflow e não truncar resultados pagos. Verificar isso com respostas simuladas, não com tentativa e erro pago.

### Interface e verificação

Uma ação contextual de pesquisar/retomar; explicações comerciais para clientes. Controles de política, custos, fornecedores e diagnósticos somente para Admin YUX, inclusive por HTTP direto. Mostrar claramente limites da campanha, autorização do lote e campos alterados antes de confirmar; não reutilizar silenciosamente um lote cuja quantidade é diferente da solicitada.

Testar banco real isolado, papéis HTTP, paginação, reservas, concorrência, interrupção/retomada, quotas do aprofundamento e navegador. A confirmação de produção deve conferir SHA do backend e o fluxo retornado pela API, não apenas a mensagem Done do Dokploy. Piloto pago só depois de autorização específica e teto atualizado; nunca herdar o aumento temporário de quota de uma sessão anterior.

## Fora do escopo

Não reimplementar CRM, WhatsApp, modelos de IA ou o portal visual. Não alterar credenciais, fontes contratadas, consentimentos de contato, valores de quota em produção, autorização TLS ou limites de outras áreas. Não excluir campanhas/empresas para contornar o problema.
