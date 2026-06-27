# Sistema de Gerenciamento de Clientes YUX (CRM & AI Agent Hub)

## Direcao Atual

O projeto evoluiu de um CRM isolado para o YUX OS: uma plataforma modular usada
internamente pela YUX e exposta aos clientes por um portal filtrado. A base agora
suporta contratos, pacotes, modulos ativaveis e blueprints por setor antes da
implementacao completa dos modulos avancados.

Sistema inteligente de CRM, prospecção ativa e gerenciamento de clientes, projetos e campanhas da YUX Soluções em IA. Este sistema serve tanto como o cérebro operacional da YUX quanto como nossa principal vitrine de tecnologia e automação para futuros clientes.

## 🌟 Visão Estratégica & Replicabilidade (Blueprints)
Todo o ecossistema foi projetado sob o princípio da **modularidade extrema**. Os workflows do n8n, os esquemas do banco de dados no Supabase e os painéis do frontend são desacoplados para funcionar como "modelos de prateleira" (*blueprints*). Isso nos permite replicar toda essa infraestrutura para qualquer cliente PME em minutos, reduzindo o custo operacional e maximizando as margens de entrega da YUX.

## 🛠️ Funcionalidades Principais

### 1. 🤖 Motor Multiagente Inteligente (AI Team)
Uma equipe de agentes autônomos integrados diretamente ao banco de dados e canais de comunicação, utilizando **Agno / LangGraph** com modelos avançados de IA (GPT-4o/Claude):
*   **Agente Prospector (Outbound):** Analisa sites e redes sociais de empresas capturadas, identifica gargalos digitais e redige propostas frias via WhatsApp altamente personalizadas.
*   **Agente Qualificador & RAG (Atendimento WhatsApp):** Realiza atendimento conversacional 24/7 humanizado via WhatsApp. Ele consulta a base de conhecimento institucional da YUX (RAG via `pgvector` no Postgres), qualifica o lead e agenda diagnósticos no calendário.
*   **Agente de Operações CRM (Supervisor):** Monitora o pipeline, alerta sobre gargalos de tempo, gera fichas automáticas de diagnóstico pré-reunião com base na conversa do lead e envia briefings diários no WhatsApp do administrador.

### 2. 🎯 Módulo de Captura de Leads Ativo (Outbound Scraper)
*   Motor de varredura ativo integrado ao n8n para busca e mapeamento geolocalizado de empresas nos setores-alvo (Estética, Saúde, Serviços e Imobiliárias).
*   Extração automática de nome, telefone, e-mail, site e dados de presença digital para alimentar o fluxo do Agente Prospector.

### 3. 💼 CRM & Gestão de Projetos
*   **Funil de Leads:** Pipeline Kanban em tempo real atualizado tanto manualmente quanto automaticamente pelas ações dos agentes no WhatsApp.
*   **Gestão de Projetos:** Controle visual de entregas com cronogramas, tarefas vinculadas, orçamentos, marcos e atribuição de terceiros/freelancers.
*   **Área do Cliente (Portal):** Canal exclusivo onde o cliente visualiza o status real de seu projeto de forma transparente, aprova criativos e interage com a equipe.

### 4. 📈 Centro de Campanhas & BI
*   **Gestão de Tráfego:** Monitoramento integrado de performance de campanhas do Google Ads e Meta Ads (CPC, CTR, Conversões, Gastos).
*   **BI & ROI Tracker:** Painéis em tempo real mostrando o retorno sobre o investimento publicitário (ROAS) e ROI das automações implementadas.

### 5. 💳 Gestão Financeira
*   Controle de faturamento de projetos e taxas de manutenção mensais (*retainers*).

---

## 📐 Stack Tecnológico

### Frontend (VPS/Dokploy)
*   React 18 + TypeScript + Vite
*   Tailwind CSS + Shadcn UI
*   Zustand (Gerenciamento de Estado Global)
*   Chart.js / Recharts (Visualizações e Relatórios de BI)

### Backend & Banco de Dados (Supabase)
*   PostgreSQL com suporte a `pgvector` (RAG e similaridade semântica)
*   Row Level Security (RLS) & Supabase Auth
*   Real-time Subscriptions para atualizações instantâneas do Kanban
*   PostgreSQL Migrations (Esquemas reproduzíveis e portáveis)

### Orquestração & Automações (n8n Self-hosted)
*   VPS Dockerizada gerenciando as conexões de mensageria (Evolution/Z-API), filas de eventos de WhatsApp, disparo de e-mails e integrações de agendas.

### Microsserviço de Agentes (Agentic API)
*   Runtime Python/FastAPI na VPS via Dokploy, com harness de agentes e integração server-side com Supabase.

---

## 📂 Estrutura do Projeto

```
yux-client-management/
├── frontend/                 # React SPA, Docker/Nginx para Dokploy
├── supabase/                 # Estruturas de Banco e Migrations SQL
│   ├── migrations/          # Versionamento reproduzível do banco
│   └── seed.sql             # Dados de teste para demonstração rápida
├── workers/                  # Runtime Python de agentes
├── docker-compose.dokploy.yml # Compose de producao na VPS
└── DEPLOY-DOKPLOY-SUPABASE.md
```

## 🚀 Desenvolvimento & Instalação

### Pré-requisitos
*   Node.js 18+ & Docker (para rodar Supabase local e n8n)
*   Supabase CLI instalado localmente

### Configuração Inicial do Frontend
```bash
cd frontend
npm install
npm run dev
```

### URLs Locais de Desenvolvimento
*   Frontend: `http://localhost:3000`
*   Supabase Dashboard (Local): `http://localhost:54321`

---

## 📑 Documentação Complementar
*   [Roadmap de Implementação](ROADMAP.md)
*   [Deploy VPS/Dokploy & Supabase](DEPLOY-DOKPLOY-SUPABASE.md)
*   [Guia de Demonstração (Demo)](DEMO-GUIDE.md)
