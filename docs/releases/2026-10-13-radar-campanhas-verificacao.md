# Verificação do Radar Comercial

Implementação do plano de campanhas, refinamento e CRM aprovada em 13/10/2026. Código funcional publicado em `main` no commit `06895ea405a1c3ae8cecce920e033e454d32978d`, com base em `7c3b42a`. O deploy no Dokploy ainda é necessário; este registro não certifica o comportamento em produção.

## Fluxo entregue

O Radar abre na lista de campanhas. Cada campanha possui URL própria e abas Resultados, Configurações e Histórico. A criação rápida local e as opções avançadas de cadastro, importação, pesquisa, evidências e governança foram preservadas.

A lista de empresas tem filtro, paginação de 20 registros, seleção por identificador e um dossiê aberto por vez. As ações distinguem descoberta, complementação, retomada, nova coleta e reavaliação dos dados salvos. A reavaliação não consulta novamente a internet; a análise por IA continua sujeita à configuração e aos créditos autorizados pelo Admin.

O envio ao CRM exige revisão atual, identidade confirmada e destino válido na mesma organização. O diálogo permite escolher CRM, funil e etapa. O lead recebe contatos corroborados, oferta, avaliação comercial, perfil, porte e evidências de atividade disponíveis. Reenvios não duplicam leads. Nenhuma mensagem, sequência ou automação de atendimento é disparada por essa entrega.

As edições da configuração ficam como rascunho na aba do navegador, isoladas por usuário, organização e campanha, por até 24 horas. Ao voltar, a interface informa a recuperação. Salvar aplica as alterações; navegar ou recuperar rascunho não inicia pesquisas.

## Correções verificadas

1. Removida a ordenação pela coluna inexistente `rule.version`, reproduzida primeiro no PostgreSQL migrado. Falhas de disponibilidade agora mostram erro e tentativa de recuperação, não carregamento indefinido.
2. Reanálises parciais retomadas preservam contatos cuja origem estava em links HTML, mesmo depois de o HTML bruto ser retirado do dossiê salvo.
3. Disponibilidade específica permite reavaliar evidências salvas mesmo com fonte de busca desativada ou quota de busca esgotada. Os controles de autorização, campanha e revisão continuam obrigatórios.
4. A entrega ao CRM preserva adequação comercial, motivos e `activityAssessment`, sem inventar e-mail nem promover telefone cadastral a contato validado.
5. Voltar pelo navegador ou sair pela navegação lateral não descarta silenciosamente as edições da configuração.
6. A reavaliação preserva a origem Brave dos fatos e seus controles de entrega, mesmo sem novas chamadas ao fornecedor.
7. O rótulo acessível da tabela foi contido no seu próprio contêiner; a página móvel deixou de vazar horizontalmente.

Uma revisão independente do intervalo `7c3b42a..162a5cb` apontou quatro problemas importantes, todos corrigidos em uma única rodada com regressões que falharam antes e passaram depois. Não foram reportados problemas críticos nem ajustes menores adiados.

## Testes executados

| Verificação | Resultado final |
| --- | --- |
| Backend completo | 195 arquivos, 849 testes aprovados |
| Frontend completo | 151 arquivos, 639 testes aprovados |
| Integrações PostgreSQL do Radar | 2 arquivos, 4 testes aprovados, nenhum pulado |
| Type check e build do backend | Aprovados |
| Type check e build do frontend | Aprovados |
| Orçamento do bundle do frontend | Aprovado |
| Jornada no Chrome como Admin | Aprovada, zero erros de página |
| Jornada no Chrome como cliente de consulta | Aprovada, zero erros de página |

Suites completas: `npx vitest run --maxWorkers=4` em cada pacote. Integrações: `npx vitest run --config vitest.integration.config.ts tests/integration/radar-research-journey.test.ts tests/integration/radar-crm-delivery.test.ts --maxWorkers=1`, usando somente um PostgreSQL temporário local.

A jornada Admin utilizou a API real da aplicação e o banco migrado, com descoberta, leitura e análise externas simuladas: criar campanha genérica por estado, buscar lote, selecionar empresa, provocar uma falha de leitura, retomar, reavaliar, atualizar pesquisa, editar critérios, recuperar rascunho por Voltar e pelo menu lateral, reavaliar na nova revisão, aprovar e abrir o lead no CRM. Também verificou histórico, paginação e persistência da URL após recarregar.

Os testes de banco cobrem isolamento entre organizações, destino estrangeiro, revisão desatualizada, ausência de módulo/permissão, entrega concorrente, ausência de e-mail e inexistência de eventos de contato/automação. Os testes de interface cobrem acesso ao Radar contratado, bloqueio sem contratação e configuração somente para consulta.

Houve um timeout de leitura do manifesto de release durante uma execução concorrente inicial. O teste específico e a suite completa limitada a quatro workers passaram posteriormente, sem aumentar timeouts ou enfraquecer verificações.

## Verificação visual

Referência: captura da interface YUX enviada pelo usuário em `codex-clipboard-bbc00493-f645-4226-8f66-11e8c00d0cad.png`. Capturas finais obtidas por Playwright no Chrome instalado, em perfil isolado, nas resoluções 1365 × 900 e 390 × 844. Referência e capturas finais foram inspecionadas visualmente.

| Aspecto | Comparação e resultado |
| --- | --- |
| Paleta | Superfícies brancas, fundo claro, bordas azuis/cinza e ações principais em azul-marinho preservados |
| Tipografia | Família existente, títulos, legendas e controles seguem o padrão YUX |
| Componentes | Botões, campos, diálogo, navegação lateral e ícones existentes reutilizados |
| Organização | Lista inicial e página dedicada substituem a expansão abaixo do formulário, conforme aprovação |
| Espaçamento | Seções com bordas discretas, respiro e detalhes recolhidos; sem dezenas de dossiês simultâneos |
| Responsividade | Tabela com rolagem própria; documento mede 390 px em viewport de 390 px |
| Texto | Ações comerciais aprovadas substituem rótulos técnicos; infraestrutura permanece restrita ao Admin |

A mudança de textos e hierarquia é intencional e corresponde ao plano aprovado. Não houve mudança de identidade visual nem adição de peças promocionais. A reorganização foi verificada contra o padrão visual existente, não contra uma nova proposta gerada por IA.

Evidências locais preservadas em `C:/Users/andre/.codex/visualizations/2026/09/05/01a073a7-4539-7ec2-9329-8bedecbe99a5/radar-ux-2026-10-13/`: telas de campanhas, dossiê, cliente e mobile, além dos registros das jornadas e suites.

## Decisões de implementação

1. Reutilizar componentes e capturas YUX, sem ImageGen, respeita o padrão visual aprovado e a proibição de ferramentas pagas sem autorização. Risco: eventual ajuste visual adicional.
2. Executar os auxiliares de processo pelo Git Bash instalado, pois não estava no PATH. Sem impacto funcional.
3. Representar e-mail ausente por string vazia, porque o CRM exige NOT NULL. Não inventar endereço. Risco: consumidores posteriores precisam aceitar e-mail ausente.
4. Manter `source_kind=manual` e registrar `acquisitionKind=outbound` na atribuição, pois o esquema rejeita outbound nesse campo. A origem Radar é preservada. Risco: apresentação da atribuição.
5. Atualizar somente o inventário das migrações 0184/0185 no manifesto. Não alterar flags de implantação/piloto. Impacto limitado às migrações previstas.
6. Usar Playwright com Chrome instalado porque o plugin Browser não estava listado e o Chromium empacotado não estava disponível. Sem instalação ou uso da sessão de produção. Limite: outros navegadores não foram testados.
7. Validar a jornada completa após integrar pesquisa e entrega ao CRM, que fornecem as ações necessárias ao teste. Risco: regressões de rota detectadas mais tarde, mas antes da publicação.
8. Usar PostgreSQL 17 nativo em cluster temporário isolado porque Docker não estava disponível. Sem impacto funcional.
9. Não testar produção nem provedores reais pagos nesta etapa. A autorização era para implementação/publicação. Limite: problemas específicos do ambiente ou fornecedor precisam de validação após deploy.
10. Preservar comportamentos preexistentes de prioridade de modelos, retomada geral e esquema CRM, salvo compatibilidade e preservação de dados exigidas pelo fluxo. Risco: defeitos antigos independentes podem permanecer.
11. Preservar rascunhos por sessão, sem migrar todo o roteador da aplicação. Risco: fechar a aba ou falha do armazenamento pode perder rascunhos; salvar continua necessário.
12. Publicar `main` por fast-forward a partir do worktree Radar, sem alterar o checkout principal com trabalho de WhatsApp. Sem force-push. O deploy continua sendo uma etapa separada.

## Após o deploy

Aplicar as migrações novas pelo fluxo normal de implantação. Confirmar primeiro, sem iniciar pesquisas pagas, que a disponibilidade responde, a campanha abre por URL própria e o histórico/dossiê carrega. Em seguida, definir e autorizar um lote pequeno de busca real antes de testar os fornecedores em produção.
