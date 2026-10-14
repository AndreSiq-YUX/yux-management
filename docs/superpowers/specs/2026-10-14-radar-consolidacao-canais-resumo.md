# Radar: consolidação de presença, canais e resumo na lista

## Pedido e resultado esperado

Corrigir o fluxo observado em produção após a leitura excepcional de um site: o dossiê contém páginas institucionais legíveis, mas a lista e os detalhes ainda dizem que o site não foi encontrado. Mostrar os fatos encontrados, o grau de associação à empresa e as pendências separadamente. Investigar o bloqueio do complemento Brave, aproveitar canais públicos e formulários e tornar a abertura dos detalhes imediata e compreensível.

O comportamento deve servir a qualquer segmento, região e oferta. Embrare é um caso de regressão, não uma regra de negócio.

## Evidências verificadas em 14/10/2026

- Produção: campanha `958f87b1-96a1-45b5-a095-d9e9eb623f67`, revisão 5. A empresa Empresa Brasileira de Refeicoes aparece como pesquisada, mas sem site na lista e no cadastro.
- O mesmo dossiê mostra `https://embrare.com.br/`, `/fornecedor/` e `/contato/` legíveis, com proveniência de autorização excepcional de certificado vencido. A associação está pendente.
- Console existente, sem repetir chamada: `radar_candidate_requires_current_discovery`. O toast atribui indevidamente essa falha à indisponibilidade/licença Brave.
- O complemento antigo exige `discoveryRevision` atual. A lista B2B já aceita `discoveryRevision` OU `researchRevision` atual. A pesquisa atualizada não corrige a revisão histórica da descoberta, nem deve fazê-lo artificialmente.
- Admin IA/LLM mostra as duas funções Radar como sem rota geral explícita. O dossiê informa ausência da rota de identificação. Backend e runtime exigem autorização específica para essas funções; não se deve remover esse controle nem escolher um modelo sem autorização.
- A projeção persistida remove o site quando a associação não está confirmada. A interface interpreta ausência desse campo como ausência de descoberta.
- A extração de canais exige uma origem já associada; assim os canais de uma página candidata legível não são nem apresentados como pendentes. O extrator já reconhece links de redes sociais, mas não formulários. O leitor não tem etapa delimitada para informações públicas de perfis sociais vinculados pelo site.
- O classificador de funcionamento só considera algumas expressões com data ISO recente ou encerramento; acessibilidade, canais e formulário não aparecem como sinais específicos.
- O botão da lista apenas seleciona um painel abaixo da tabela inteira, sem resumo local nem foco/âncora.

## Requisitos

1. Separar descoberta, leitura, associação de identidade, finalidade do canal, aderência à oferta e funcionamento. Um site encontrado e não associado deve aparecer como tal, nunca como não encontrado nem como oficial confirmado.
2. Consolidar o resultado corrente na lista, resumo e detalhes após pesquisa, retomada e reanálise. Reaproveitar dossiês existentes sem novas buscas para corrigir a representação; não inventar dados ausentes de evidências antigas.
3. Extrair canais de páginas institucionais candidatas legíveis como sugestões pendentes, com fonte/data/escopo. Confirmar somente quando a identidade permitir. Não aproveitar contatos/redes do editor de diretórios. Diferenciar matriz/grupo e estabelecimento.
4. Reconhecer formulário comercial/fornecedores como canal, com URL da página e finalidade. Não confundir newsletter, busca ou formulário de candidatura com canal de fornecedores; não enviar formulários.
5. Preservar links de perfis realmente publicados no site. Oferecer consulta pública limitada a esses perfis, configurável na campanha e desativada por padrão, respeitando o leitor seguro e os limites totais existentes. Não seguir recursivamente redes sociais. Sem login, CAPTCHA, contas pessoais, APIs novas ou contorno de bloqueios. Exibir impedimentos reais. Link publicado não comprova perfil ativo nem autoria antes da associação do site.
6. Exibir sinais factuais de presença pública e, separadamente, sinais de atividade recente. Site acessível, contato publicado e formulário são úteis, mas não comprovam operação atual, telefone atendido, entrega de e-mail ou consentimento. Preservar contradições/encerramento.
7. Corrigir a elegibilidade do complemento Brave para aceitar pesquisa corrente válida como as demais telas, sem falsear a revisão de descoberta. Revalidar estado/revisão antes de reservar custo e ao persistir. Preservar licença, chave, fonte, quotas, orçamento, permissões e proteção de empresas aprovadas.
8. Mostrar erros específicos e acionáveis. Uma falha de atualização secundária da tela após sucesso não pode ser apresentada como falha do provedor. Não chamar o provedor para diagnosticar configuração.
9. Ao clicar Ver detalhes, expandir resumo abaixo da própria empresa: site e situação do vínculo, principais canais/finalidade, localização, sinais e pendências principais. Ver detalhes completos abre o painel atual e posiciona foco/rolagem nele. Preservar filtros, paginação, seleção, pesquisa, revisão, exportação e CRM.
10. Manter o padrão visual YUX e rótulos comerciais; diagnósticos técnicos e configurações do fornecedor ficam no contexto administrativo apropriado.

## Restrições e autorização

- Nenhum modelo pago, fallback ou provedor novo será escolhido/acionado sem autorização. Rotas, custos e limites continuam configuráveis pelo Admin.
- Este plano não altera a política de herança global nem salva rotas automaticamente. Ativar a identificação/qualificação por IA requer que o Admin selecione e salve as rotas, ou autorize explicitamente que o agente salve um modelo determinado.
- Testes automatizados e QA usam respostas simuladas/local, sem consumo de provedores. Piloto real separado após deploy/configuração e autorização de consumo.
- TLS estrito por padrão; exceção existente continua restrita a certificado/host/empresa/execução/revisão e duração. Uma autorização do site não se estende ao Facebook, LinkedIn ou outro host.
- Não apagar histórico nem alterar automaticamente contatos aprovados ou leads já entregues ao CRM. Canais pendentes não viram contatos confirmados do CRM.
- Ao terminar, testar e revisar, publicar em main conforme autorização anterior; não fazer deploy automaticamente.
