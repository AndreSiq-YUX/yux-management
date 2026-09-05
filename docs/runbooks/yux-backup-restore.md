# Backup e restauração da YUX Hub

## Objetivo e ativos obrigatórios

Meta inicial: RPO de até 1 hora e RTO de até 4 horas. Qualquer mudança dessas metas exige medição documentada e aprovação antes do piloto.

Um backup só é elegível para restauração quando contém, no mesmo manifesto:

- dump lógico PostgreSQL em formato custom;
- `yux_materials_data`;
- `yux_company_knowledge_data` com os originais usados na curadoria;
- `yux_omnichannel_attachments_data`;
- Redis/AOF apenas como apoio à recuperação, nunca como fonte canônica de negócio;
- commit, digests das imagens, migrations registradas e referência à custódia das chaves.

Antes de afirmar que não há backup, inventarie snapshots do provedor da VPS, storage externo, cópias do Dokploy, jobs de backup anteriores e custódia corporativa. Registre localização, retenção, última execução válida, responsável e acesso testado. Nunca copie valores de chaves para o manifesto.

## Criação consistente

1. Gere um `backupId` único e uma pasta fora dos volumes ativos.
2. Suspenda criação de efeitos, schedulers e consumidores. Aguarde jobs ativos concluírem ou registre explicitamente os que serão reconciliados.
3. Registre início da janela de quiescência.
4. Execute `pg_dump --format=custom --no-owner --no-acl` com a credencial de backup de leitura adequada.
5. Com as aplicações que escrevem arquivos ainda suspensas, arquive separadamente cada volume obrigatório. Não copie o diretório de dados de um PostgreSQL ativo.
6. Registre migrations com checksum/origem e digests das imagens implantadas.
7. Calcule SHA-256 e tamanho de cada artefato; finalize o manifesto conforme `ops/backup/manifest.schema.json`.
8. Transfira artefatos e manifesto para o destino externo aprovado, aplique retenção/imutabilidade e confirme leitura independente.
9. Retome os serviços somente depois de conferir o estado da fila e registrar o fim da janela.

Falha, atraso além do RPO, checksum divergente, volume ausente ou destino ilegível tornam o backup inválido e devem gerar alerta acionável. O alerta precisa identificar `backupId`, classe ausente e idade do último backup válido, sem segredos.

## Ensaio de restauração isolada

1. Crie rede, host e nomes de volumes exclusivos do ensaio. Sem DNS público, SMTP, Meta, Google, Jina, OpenRouter ou webhooks reais.
2. Mantenha API, worker, schedulers e consumidores desligados. Restaure primeiro o PostgreSQL e os volumes.
3. Verifique todos os SHA-256 antes de abrir os artefatos.
4. Restaure o dump com `pg_restore --exit-on-error --no-owner --no-acl` em banco cujo nome comece com `yux_test_`.
5. Monte os volumes em containers de inspeção somente leitura e confira amostras vinculadas pelo banco: material, documento original e anexo omnichannel.
6. Confira migrations, organizações, documentos, ledger de efeitos, outbox e jobs pendentes.
7. Inicie apenas uma API de inspeção com efeitos externos desabilitados e credenciais de provedores ausentes. Não inicie worker.
8. Reconcile outbox e efeitos ambíguos em modo relatório. Nada é reenviado automaticamente após restore.
9. Meça desde o início do restore até a conclusão dos vínculos/amostras. Registre RPO observado, RTO observado, falhas e responsável pelo aceite.
10. Destrua apenas os recursos identificados do ensaio após guardar relatório e manifesto; nunca use nomes de volumes produtivos em comandos de remoção.

## Testes de falha obrigatórios

- artefato expirado: alerta antes de ultrapassar 1 hora desde o último backup válido;
- checksum alterado: restauração interrompe antes do `pg_restore`;
- um volume ausente: manifesto ou validação falha;
- chave sob custódia inacessível: restauração não é declarada concluída;
- outbox pendente: nenhum contato externo ao iniciar a inspeção;
- backup interrompido: artefato parcial não recebe estado válido.

O relatório do ensaio deve referenciar o manifesto, não incluir dados pessoais desnecessários e ser revisado por alguém diferente de quem gerou o backup.

