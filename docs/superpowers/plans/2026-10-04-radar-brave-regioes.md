# Correções Brave e abrangência das campanhas

Objetivo: corrigir os parâmetros enviados à Brave e tornar explícita a criação por estados inteiros ou cidades, preservando campanhas locais e controles de custo/licença.

1. Reproduzir com testes a requisição Brave com idioma inválido e a criação regional sem cidade.
2. Usar `search_lang=pt-br` e o formato de localização documentado para países fora dos EUA; manter UF na consulta. Apresentar campos inválidos do HTTP 422 sem expor chave ou texto arbitrário do provedor.
3. Tornar a pesquisa configurável o caminho principal do Admin, com seleção clara de estados inteiros ou cidades específicas. Preservar criação local e de empresas recém-abertas.
4. Testar um estado, múltiplos estados, cidades específicas e rejeição de configuração inconsistente, além da integração Brave com respostas simuladas. Não consultar provedores pagos.
5. Executar testes e builds, revisar alterações, publicar em `main` sem incluir alterações alheias. O teste real da chave ocorrerá depois do deploy pelo usuário.

Sem migração de banco: o contrato regional existente já suporta cidades opcionais e múltiplas UFs. Não alterar critérios ou resultados de campanhas já salvas.
