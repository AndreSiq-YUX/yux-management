# Migrations PostgreSQL da YUX Hub

O executor de migrations usa um único client reservado desde a aquisição do lock consultivo até a liberação. Cada arquivo pendente é aplicado e registrado na mesma transação. Falha em qualquer instrução executa rollback e interrompe o lote; uma segunda instância aguarda o lock e reavalia o histórico antes de agir.

## Integridade do histórico

Migrations aplicadas pelo executor atual registram:

- `checksum_sha256`: SHA-256 do SQL normalizado;
- `checksum_algorithm`: `sha256:utf8:lf:bom-and-nul-removed:trim-start:v1`;
- `verification_origin`: `repository_artifact`.

A normalização remove apenas BOM inicial e bytes NUL, converte CRLF/CR para LF e remove espaço inicial antes de calcular o hash e executar o conteúdo. Alterar um arquivo com checksum registrado interrompe o deploy com `migration_checksum_mismatch`; o arquivo aplicado deve permanecer imutável e a correção deve usar uma nova migration.

Registros históricos sem checksum recebem `verification_origin=legacy_unverified`. O executor não calcula retroativamente o hash atual, porque isso não provaria qual artefato foi executado no passado. Atestar um baseline legado exige comparar uma cópia sanitizada do esquema implantado com o artefato de release e guardar essa evidência fora do valor calculado automaticamente.

## Operações incompatíveis com transação

O caminho padrão não aceita exceções silenciosas à atomicidade. Operações como `CREATE INDEX CONCURRENTLY`, que não podem executar dentro do bloco transacional, exigem tarefa operacional própria com:

1. migration preparatória compatível;
2. comando idempotente separado e monitorado;
3. verificação do índice/objeto criado;
4. registro explícito da conclusão;
5. estratégia de retomada e rollback não destrutivo.

Não inserir `CREATE INDEX CONCURRENTLY` em `backend/src/db/migrations` esperando que o executor suspenda a transação.

## Verificação

Em ambiente descartável, validar instalação limpa, falha parcial, dois executores concorrentes e alteração de arquivo já aplicado:

```powershell
npm --prefix backend run test:integration -- tests/integration/migrations.test.ts
```

Antes do deploy, confira que a imagem contém exatamente os arquivos esperados e que não existe diff em migrations já publicadas. O acesso de migração deve usar a credencial própria de migrador; não use o wrapper de contexto das requisições HTTP.

