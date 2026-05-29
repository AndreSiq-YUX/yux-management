# 🗺️ Roadmap Estratégico - Sistema de Gerenciamento de Clientes YUX (CRM & AI Agent Hub)

## 📊 Status Geral do Projeto

*   **Progresso Atual:** ~50% concluído (após expansão do escopo estratégico de IA Agentica e Outbound)
*   **Próximo Marco:** Conclusão da base de Projetos/Leads e início da integração do n8n para Captura Ativa.
*   **Filosofia:** Cada módulo concluído deve ser documentado e estruturado como um **ativo replicável (blueprint)**, gerando valor imediato para a YUX e servindo de modelo pronto para venda a clientes PME.

---

## ✅ Funcionalidades Implementadas (Base Operacional)

### 🏗️ Infraestrutura Base & Limpeza
*   [x] Reorganização arquitetural: migração completa de Node.js/Docker para **Vercel + Supabase** (redução de 50% de arquivos e complexidade).
*   [x] Estrutura frontend em **React + TypeScript + Vite**.
*   [x] Design System unificado com Tailwind CSS + shadcn/ui.
*   [x] Conexão com Supabase DB local (via CLI) e em nuvem (Vercel).

### 👥 CRM Base (Clientes)
*   [x] Listagem inteligente de clientes com tabela responsiva e filtros avançados (setor, tamanho, valor, origem).
*   [x] CRUD completo com validação rigorosa (Zod) via Modais (`ClientFormModal` e `ClientDetailsModal`).
*   [x] Exportação e importação de dados de clientes em lote (CSV/Excel).
*   [x] Dashboards de resumo com métricas de Lifetime Value (LTV) e segmentações.

---

## 🚧 Roadmap de Desenvolvimento (Fases Futuras)

```
Fase 1: CRM Base (Projetos & Leads) 🚀
       └── Fase 2: Módulo Outbound (n8n Lead Scraper) 📍
              └── Fase 3: Motor Multiagente (Agno/FastAPI) 🤖
                     └── Fase 4: Campanhas & Ads Integration 📈
                            └── Fase 5: Portal do Cliente (Blueprints) 👥
```

---

### 🔄 Fase 1: Finalizar CRM Base (Projetos e Leads) — 2 Semanas
*Objetivo: Ter a estrutura visual e de banco de dados rodando em TypeScript e Supabase para gerenciar entregas e oportunidades.*

#### **Subfase 1.1: Projetos (Kanban & Tarefas)**
*   [ ] **CRUD de Projetos:** Criar modais de criação/edição vinculados aos clientes da base.
*   [ ] **Visualização Kanban:** Criar painel visual para gerenciar o progresso dos projetos (ex: Prospecção, Setup, Homologação, Manutenção).
*   [ ] **Sub-tarefas e Prazos:** Gestão de check-lists internos e atribuição de prazos de entregas.
*   [ ] **Integração com Supabase:** Migrations SQL criadas e RLS configuradas para a tabela `projects`.

#### **Subfase 1.2: Leads (Pipeline Comercial)**
*   [ ] **Funil de Vendas Visual:** Colunas para novos leads, qualificações, propostas enviadas e negociações.
*   [ ] **Zod Validation:** Schemas rigorosos de leads prontos para receber dados do site e de agentes externos.

---

### 🔄 Fase 2: Módulo de Captura de Leads Ativo (n8n Web Scraper) — 2 Semanas
*Objetivo: Criar a ferramenta de outbound ativo que serve como nossa primeira automação de prospecção e vitrine de vendas.*

*   [ ] **Configuração da Instância n8n:** Hospedar n8n em Docker (VPS Contabo) conectado de forma segura à API do Supabase.
*   [ ] **Fluxo Scraper Google Maps/CNPJ:** Workflow que extrai empresas locais de setores prioritários (Estética, Clínicas, Imobiliárias) por região.
*   [ ] **Filtro de Qualidade Digital:** n8n valida automaticamente se a empresa possui site lento, se carece de WhatsApp na home ou se não roda anúncios.
*   [ ] **Alimentação Direta do CRM:** O n8n insere automaticamente os leads encontrados diretamente na tabela `leads` do Supabase para ação da IA.

---

### 🔄 Fase 3: Motor Multiagente (AI Agentic Core) — 3 Semanas
*Objetivo: Integrar os agentes inteligentes autônomos (Agno / LangGraph) no cotidiano da YUX.*

*   [ ] **FastAPI Python Microservice:** Estruturar microservice em Python integrado à VPS para gerenciar os agentes cognitivos de forma assíncrona.
*   [ ] **Agente 1: O Prospector (Outbound):** 
    *   Treinar agente para ler o site dos leads capturados na Fase 2.
    *   Gerar propostas frias personalizadas via WhatsApp abordando os gargalos específicos de marketing/tecnologia da empresa.
*   [ ] **Agente 2: O Qualificador RAG (WhatsApp):**
    *   Conectar WhatsApp (Evolution/Z-API) ao n8n e à API do Agente.
    *   Implementar busca semântica (`pgvector` no Postgres) na base de conhecimento da YUX (FAQ, serviços, preços).
    *   Treinar a IA para conversar de forma humana, responder objeções de PMEs e conduzir o agendamento de reuniões.
*   [ ] **Agente 3: O CRM Supervisor:**
    *   Gerar briefings matinais automáticos no WhatsApp de André às 8h com status dos leads.
    *   Criar fichas automáticas de diagnóstico com resumo inteligente das dores do lead assim que uma reunião for agendada.

---

### 🔄 Fase 4: Integrações de Campanhas (Google & Meta Ads) — 2 Semanas
*Objetivo: Monitorar anúncios pagos dos clientes e provar o ROI gerado pelas campanhas.*

*   [ ] **OAuth2 & Conexão de APIs:** Fluxos n8n para autenticação segura no Google Ads API e Meta Marketing API.
*   [ ] **Sincronização Periódica de Métricas:** Jobs do n8n para atualizar impressões, cliques, custos, conversões e CPC no banco Supabase.
*   [ ] **ROI Tracker:** Algoritmo que calcula automaticamente o ROAS e a economia gerada pelas automações YUX implementadas nos clientes.

---

### 🔄 Fase 5: Portal do Cliente & Blueprints de Venda — 2 Semanas
*Objetivo: Criar a área exclusiva do cliente para acompanhamento e modularizar tudo para replicação rápida.*

*   [ ] **Portal do Cliente Responsivo:** Dashboard seguro em React onde o cliente acompanha o progresso real dos seus projetos e o ROI das suas campanhas.
*   [ ] **Sistema de Notificações & Aprovação:** Fluxos n8n para aprovação de criativos e contratos com assinaturas/alertas.
*   [ ] **Blueprint Packing:** Documentar e modularizar:
    *   Triggers e JSONs do n8n como templates importáveis em 1 clique.
    *   Supabase Migrations empacotadas para criação instantânea de tabelas e RLS.

---

## 🛠️ Critérios de Sucesso (MVP e Produção)

### Versão 1.0 (MVP Operacional YUX)
*   [ ] Kanban de Clientes e Projetos 100% funcional no React.
*   [ ] n8n integrado capturando leads ativos e cadastrando no Supabase.
*   [ ] Agente de Atendimento WhatsApp respondendo perguntas institucionais com RAG e agendando diagnósticos.
*   [ ] Deploy estável na Vercel conectado ao Supabase Cloud.

### Versão 2.0 (Vitrine Premium)
*   [ ] Todos os 3 agentes rodando (Prospector, Qualificador, Supervisor do CRM).
*   [ ] Painéis de BI reais puxando Google/Meta Ads via n8n.
*   [ ] Portal do Cliente funcional e white-label.
*   [ ] Templates de automação n8n prontos para exportação.

---

## 📞 Contato & Suporte Técnico
*   **Time de Engenharia:** Lia (AI Code Agent)
*   **Contato YUX:** André (Founder)
## Marco Atual: Fundacao Modular YUX OS

1. Schema de organizacoes, usuarios, permissoes, contratos, pacotes, modulos e blueprints.
2. Navegacao interna/portal baseada em modulos ativos.
3. CRM, projetos, tarefas, entregas, suporte e aprovacoes sobre a mesma fundacao.
4. Propostas, ROI, BI, WhatsApp IA e automacoes conectados por extensoes da plataforma.
