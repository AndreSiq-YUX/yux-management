# Estratégia da empresa e portfólio multimarcas

Este incremento foi implementado e homologado localmente com empresas sintéticas. Este documento não confirma implantação em produção nem autoriza alteração de clientes reais.

## Comportamento entregue

- Empresa → Estratégia permite manter várias estratégias, escolher a principal, editar rascunhos, publicar e consultar versões anteriores. Não exige orçamento de execução, site ou Radar.
- A publicação vigente orienta os agentes da organização. Livros, metodologia e funcionamento das ferramentas continuam no conhecimento global da plataforma.
- Missões pode propor uma estratégia ou revisar uma versão indicada. O usuário revisa o conteúdo e salva um rascunho; a publicação continua separada. A conversa mantém uma referência estável à proposta, sem reescrever mensagens históricas.
- Uma revisão concorrente retorna conflito e preserva o texto. Repetições da mesma solicitação usam a mesma chave de idempotência.
- No perfil, “Como a empresa atua” aceita múltiplos modelos. Representadas pertencem ao mesmo cliente; não criam outras contas. Alterar modelos não exclui cadastros existentes.
- Produtos usam o catálogo existente, com representada, SKU, embalagem, conservação, regiões e disponibilidade comercial confirmada ou desconhecida. Documentos e URLs podem ser vinculados à representada e seguem a governança normal de publicação.
- A leitura de sites de representadas tem destino explícito, preserva o perfil e a identidade visual do representante, e gera sugestões para revisão. Referências estáveis já existentes não são sobrescritas; possíveis produtos homônimos permanecem separados para conciliação.
- A busca de portfólio considera relevância e paginação. Marca, embalagem e condições não são fundidas. Cadastro comercial não é comprovação de demanda, autorização de contato ou garantia de entrega.

## Preparação da implantação

1. Revisar o diff integrado com a versão atual de produção. Preservar alterações de Projetos e as correções concorrentes do Radar. Confirmar que API, worker, runtime e frontend serão construídos a partir do mesmo commit aprovado.
2. Registrar os commits/imagens atualmente implantados e o inventário de migrations. Fazer backup verificável do banco e confirmar o procedimento de restauração, conforme a operação existente.
3. Confirmar a configuração atual das conversas, módulos e vínculos de conhecimento. Este incremento não amplia allowlists, não habilita Radar/WhatsApp e não publica documentação automaticamente.
4. Executar os testes locais documentados abaixo antes de construir as imagens.

## Ordem dos serviços

1. Aplicar pelo runner PostgreSQL existente as migrations aditivas `0240` a `0246`, na ordem do inventário. Não usar outro histórico de migrations e não reaplicar versões editadas. `0242` corrige o orçamento do contexto de estratégia; `0246` preserva orientações estruturadas dos produtos na projeção do portfólio.
2. Implantar API e worker com o contrato de propostas, validação de escopo, concorrência, importação direcionada e novas funções de contexto.
3. Implantar o runtime com recuperação da estratégia/portfólio e `strategyProposal` opcional. Validar acesso com o papel `yux_runtime`: a projeção permitida deve funcionar; acesso bruto às estratégias deve ser negado.
4. Implantar o frontend. Oferecer revisão por Missões somente quando todas as partes aceitarem o contrato novo e a organização já tiver acesso às conversas. Em implantação mista, manter a interface anterior até concluir os serviços; não encaminhar propostas novas a workers antigos.
5. Confirmar que a API/worker e o runtime observam o mesmo inventário, sem erros de função SQL inexistente, de contrato ou de permissão. A migration não publica rascunhos existentes.

## Homologação após implantação

Em uma organização de homologação autorizada, testar administrador YUX, operador, administrador do cliente e membro. Verificar também chamadas HTTP diretas, sem depender apenas da visibilidade dos botões.

1. Criar estratégia sem módulo de execução e sem site; salvar, recarregar, publicar e editar novo rascunho. Um novo turno de outro agente deve continuar usando a publicação anterior até uma nova publicação explícita.
2. Propor uma estratégia em Missões, abrir a revisão, editar e salvar rascunho. Confirmar ausência de missão executável, pesquisa, campanha ou contato criado por esse salvamento.
3. Pedir revisão de uma estratégia existente. Alterar manualmente a mesma estratégia em outra sessão: a proposta antiga deve apresentar conflito e não sobrescrever a edição.
4. Verificar atendimento externo: somente seções `external_guidance` da estratégia, sem objetivo/resumo interno, margem ou condições comerciais internas das representadas. Uma conta não deve recuperar fontes de outra.
5. Cadastrar representante e distribuidor simultaneamente, duas marcas e produtos homônimos com embalagens distintas. Trocar o modelo de atuação e confirmar que o portfólio permanece acessível.
6. Usar fonte sintética para importar uma representada. Revisar sugestões; confirmar preservação da identidade principal. Repetir referência estável e conferir conciliação, sem duplicação automática nem substituição de produto confirmado.
7. Buscar produto posterior à primeira página e conferir marca, embalagem, conservação, restrições e disponibilidade desconhecida. Arquivar a marca deve retirá-la dos novos contextos, preservando histórico.
8. Inspecionar erros do navegador, API e worker. Falha de rede deve preservar o texto para nova tentativa. Só então avaliar um piloto com consumo externo, mediante autorização e orçamento próprios.

## Verificação local reproduzível

Backend: `npm test`, `npm run type-check` e suites de integração `company-strategy*`/`represented-*`, usando apenas o banco de testes dedicado em `YUX_INTEGRATION_DATABASE_URL` e o provedor simulado do rig.

Frontend: `npm test -- --maxWorkers=2`, `npm run type-check`, `npm run build`, e navegador desktop/celular nos caminhos `/portal/empresa/estrategia`, `/client-workspaces/:organizationId/empresa/estrategia` e Perfil da empresa.

Runtime: `python -m pytest -q`. As provas incluem o conteúdo efetivamente enviado ao provedor simulado, revisão/hash publicados, produto relevante posterior aos dez primeiros, projeção externa e limites de organização/contrato/perfil.

## Recuperação

Suspender a entrada de novas propostas e reverter a interface para os artefatos anteriores, conforme o procedimento de release existente. Preservar tabelas, revisões, publicações e propostas; não executar `DROP`, exclusão em cascata ou alteração de migrations aplicadas. A versão anterior pode ignorar campos opcionais, mas não deve processar jobs novos com payload incompatível. Drenar ou reter esses jobs antes de reverter workers. Rascunhos não alteram a publicação vigente.

## Incrementos posteriores

Extração visual de catálogos, biblioteca de imagens vinculada a produtos, aprovação de arquivos para envio e anexos pelo SDR não fazem parte deste incremento. Nenhuma imagem encontrada num site se torna automaticamente um material aprovado. O cadastro e a estratégia também não iniciam pesquisas pagas, campanhas ou mensagens.
