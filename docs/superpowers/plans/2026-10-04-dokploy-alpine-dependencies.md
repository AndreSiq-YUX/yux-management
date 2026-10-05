# Correção das dependências Alpine — Implementation Plan

> Execução nativa nesta sessão, autorizada pelo usuário após a leitura do erro no Dokploy. As sub-skills de execução não estão disponíveis neste ambiente; usar o fluxo local de testes e revisão.

**Goal:** Remover o bloqueio do build por revisão Alpine indisponível, mantendo os mínimos de segurança.

**Architecture:** Trocar igualdade exata por restrições mínimas entre aspas nos pacotes de runtime. Manter imagens-base e digests, locks, comandos de build, usuários e verificações de segurança.

**Tech Stack:** Docker, Alpine APK, Vitest.

**Spec:** O log do deploy `ab9bfee` mostra `libcrypto3-3.5.9-r0` e `libssl3-3.5.9-r0` incompatíveis com a igualdade exigida `3.5.8-r0`; o usuário autorizou corrigir e publicar em main.

## Global Constraints

- Mínimos mantidos: OpenSSL `3.5.8-r0`, libuuid `2.42.3-r1`.
- Sem alterações de funcionalidade, banco, credenciais ou configuração de produção.
- Não modificar relatórios históricos de auditoria como se houvesse nova análise de segurança.

## Review Focus

- Revisão antiga removida: permitir substituições mais novas, não exigir igualdade.
- Redirecionamento de shell: colocar as restrições com `>` entre aspas.
- Piso de segurança: impedir pacotes sem restrição mínima.
- Diferença entre builds locais/Dokploy: cobrir ambos os Dockerfiles Node.
- Runtime Python: aplicar também aos pacotes Alpine do harness, preservando usuário e hashes.

### Task 1: Compatibilidade das bibliotecas de runtime

**Files:** `backend/Dockerfile`, `backend/Dockerfile.dokploy`, `workers/marketing-studio-agent-runtime/Dockerfile`; teste `backend/tests/runtime-dockerfiles.test.ts`; orientação em `docs/runbooks/dokploy-alpine-dependencies.md`.

**Interfaces:** APK consome dependências `nome>=versão` entre aspas; a interface dos serviços não muda.

- [ ] Criar testes que exijam `'libcrypto3>=3.5.8-r0'`, `'libssl3>=3.5.8-r0'` e `'libuuid>=2.42.3-r1'`, upgrade, bases por digest, usuários não-root e locks.
- [ ] Executar `npm test -- tests/runtime-dockerfiles.test.ts`; confirmar falha antes da correção.
- [ ] Aplicar as restrições nos três Dockerfiles e documentar a diferença entre mínimos e revisões exatas.
- [ ] Executar os testes, verificar o diff e a compilação backend. Sem Docker local, não alegar build de imagem ou deploy validado.
- [ ] Revisar e publicar commit em `main`; o próximo deploy no Dokploy valida instalação real e demais etapas.
