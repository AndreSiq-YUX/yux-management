# Dokploy: dependências Alpine com mínimo de segurança

## Incidente de 2026-10-04

O build do commit `ab9bfee` parou antes da compilação: os Dockerfiles exigiam `libcrypto3=3.5.8-r0` e `libssl3=3.5.8-r0`, enquanto o APK encontrou `3.5.9-r0`. Os repositórios Alpine são atualizados independentemente do digest da imagem-base. Fixar uma revisão retirada do repositório pode impedir reconstruções.

## Correção

Os Dockerfiles Node (local e Dokploy) e Python usam agora dependências mínimas entre aspas, com `apk add --no-cache --upgrade`:

- `'libcrypto3>=3.5.8-r0'`
- `'libssl3>=3.5.8-r0'`
- `'libuuid>=2.42.3-r1'` no runtime Python

O operador `>=` permite revisões mais novas sem remover o piso auditado. As aspas impedem interpretar `>` como redirecionamento de shell. Referência: [manual oficial APK](https://github.com/alpinelinux/apk-tools/blob/master/doc/apk-world.5.scd).

Bases e digests, locks, usuário não-root, remoção de npm/npx, controles de vulnerabilidade e geração de SBOM da CI não mudam. A versão exata instalada passa a ser identificada no SBOM de cada imagem; a auditoria histórica T28 não representa uma nova análise dessas imagens. Para reconstrução byte a byte, seria necessário também um snapshot imutável dos repositórios APK, não apenas o digest da base.

## Validação e deploy

Os testes `backend/tests/runtime-dockerfiles.test.ts` verificam os três arquivos, pisos de versão, aspas e proteções preservadas. Eles não executam APK ou Docker. A máquina local não possui Docker/WSL instalado; a construção real precisa ser confirmada pela CI ou Dokploy.

Após publicar em `main`, iniciar o deploy no Dokploy e conferir que a instalação APK foi concluída, que os builds terminaram e que as migrações e serviços ficaram saudáveis. Não considerar o push ou os testes locais como confirmação de implantação. Não mudar credenciais, apagar volumes, desativar verificações ou reinstalar o banco para tratar este erro.
