# Acesso administrativo seguro à YUX Hub

## Caminho habitual

O Compose publica os serviços apenas com `expose`; não deve mapear API, PostgreSQL ou Redis diretamente no host público. O acesso habitual passa pelo proxy HTTPS gerenciado no Dokploy, com certificado válido, redirecionamento HTTP→HTTPS, cookies seguros e origem CORS correspondente ao domínio aprovado.

Antes de restringir qualquer regra de rede:

1. configure o domínio administrativo definitivo no proxy;
2. emita/renove o certificado e valide cadeia, nome e expiração;
3. teste login, logout, expiração de sessão e uma rota administrativa pelo HTTPS novo;
4. abra uma segunda sessão de manutenção e valide o caminho de recuperação;
5. só então remova exposição HTTP direta e portas administrativas públicas.

O teste deve confirmar que não há sessão administrativa utilizável em HTTP e que API, PostgreSQL e Redis não estão publicamente acessíveis. Headers encaminhados pelo proxy só são confiáveis quando chegam do proxy controlado.

## Manutenção e recuperação

Mantenha um caminho independente do aplicativo: console do provedor da VPS ou SSH com chaves individuais, MFA quando suportado e lista limitada de operadores. Para acesso temporário a Postgres/Redis, prefira túnel SSH vinculado a `127.0.0.1`; não abra a porta no firewall como conveniência.

Mudanças de firewall/proxy devem ter:

- operador e revisor identificados;
- regra anterior exportada;
- janela e critério de sucesso;
- sessão de recuperação já validada;
- comando/recurso exato de reversão;
- expiração para qualquer exceção temporária.

Se o HTTPS novo falhar, reverta pelo console/SSH já testado. Não reabra HTTP administrativo como solução permanente e não remova o último caminho de recuperação durante a mesma operação que configura o novo.

## Evidência do aceite

Registre domínio (sem parâmetros sensíveis), emissor e expiração do certificado, resposta HTTPS, resultado do redirecionamento, portas externas observadas, teste de sessão segura, caminho de manutenção e revisor. O domínio definitivo ainda precisa ser preenchido no diário de execução antes do piloto.

