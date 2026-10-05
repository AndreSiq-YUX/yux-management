# Radar Comercial para clientes contratados

## Ativação

1. Publicar backend e frontend de main. A inicialização do backend aplica `0182_radar_client_module.sql` pelo fluxo normal de migrações.
2. No painel interno, abrir **Contratos**, selecionar o contrato ativo do cliente e habilitar **Radar Comercial** na lista de módulos contratados.
3. Atualizar a sessão/página do cliente. O menu **Comercial → Radar Comercial** aparece no portal (`/portal/comercial/radar`) e no workspace selecionado pela equipe YUX.
4. Contratar CRM, sozinho, não libera Radar. Nenhum contrato existente é habilitado pela migração.

## Acesso nesta entrega

O administrador e os membros do cliente recebem `radar.read`: consulta de campanhas, candidatos, evidências, oportunidades, análises, métricas, progresso e exportação das listas verificadas, respeitando as licenças das fontes. A operação permanece com a equipe YUX. A solicitação atual é de exibição para clientes; criação/operação pelo cliente depende de confirmação separada. Não habilitar `radar:manage` manualmente como substituto dessa etapa: as fontes e operações administrativas continuam com restrições próprias.

A equipe YUX pode preparar campanhas no workspace do cliente habilitado. As fontes continuam configuradas centralmente, com controle de custos, limites, credenciais e retenção. Não há envio automático de mensagens adicionado por esta entrega.

O backend verifica vínculo com a organização, permissões e o módulo no contrato ativo mais recente. Campanhas, candidatos, duplicidades e oportunidades são conferidos pelo seu proprietário antes de uso. Lotes precisam de autorização para todos os itens antes de qualquer efeito. A conversão de cliente para lead exige contratação e permissão de escrita no CRM separadamente.

## Teste após deploy

- Habilitar Radar no contrato de um cliente de teste, sem habilitar CRM: o menu e a consulta devem funcionar.
- Abrir o portal com um usuário vinculado a esse cliente: somente dados desse workspace devem aparecer.
- Desabilitar Radar e atualizar a página: o menu desaparece; acesso direto à página e chamadas da API ficam bloqueados.
- Usar um cliente sem Radar: CRM não deve liberar o módulo; IDs de recursos de outra organização e lotes mistos também devem ser recusados.
- Consultas e exportações não iniciam pesquisas pagas. Não executar buscas em produção para validar a exibição.

## Verificação local

790 testes do backend e 604 testes da interface aprovados; builds de ambos aprovados. Migração idempotente e autorização SQL verificadas em PostgreSQL embarcado (PGlite), incluindo contratação desativada, contrato inativo, vínculo removido, contrato ativo mais recente, recursos de outra conta e permissões independentes de CRM. Não representa validação de um deploy em produção.
