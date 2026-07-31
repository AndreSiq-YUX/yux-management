# Guia de Demonstração - Sistema Inteligente YUX (CRM & AI Agent Hub)

## 🚀 O Ecossistema YUX
O YUX Client Management é um **Hub de IA e CRM** 100% funcional. Ele serve como o cérebro operacional da YUX Soluções em IA e como uma **vitrine de vendas viva**. Toda a sua infraestrutura é projetada sob o conceito de **Blueprints (Modelos Replicáveis)**, permitindo clonar esses módulos para clientes PME de forma automatizada.

Este guia orienta como demonstrar todas as funcionalidades do sistema, incluindo os novos módulos de **IA Agentica**, **Captura Ativa de Leads** e **Orquestração via n8n**.

---

## 📊 Estrutura de Demonstração dos Agentes de IA

Para demonstrar o poder das nossas automações de forma prática (sem depender de conexões WhatsApp físicas em tempo de teste), o sistema inclui rotas de simulação para a nossa **equipe virtual de agentes**:

### 🤖 Os Agentes e seus Cenários de Demonstração

#### 1. Agente Prospector (Outbound Scraper & Analyzer)
*   **O que ele faz:** Varre o site de um lead capturado de forma ativa, mapeia gargalos de tecnologia/marketing e gera uma mensagem de abordagem comercial ultra-personalizada.
*   **Como demonstrar:** 
    *   No pipeline de Leads, selecione um lead com site cadastrado (ex: "Clínica Bem Estar").
    *   Clique no botão **"Disparar Prospecção por IA"** (ou chame a API de prospecção).
    *   O agente fará a varredura e gerará uma proposta estruturada baseada nas dores reais detectadas no site do lead.

#### 2. Agente Qualificador & RAG (Atendimento WhatsApp)
*   **O que ele faz:** Simula um atendimento humanizado no WhatsApp integrado a uma base de conhecimento PostgreSQL (RAG via `pgvector`).
*   **Como demonstrar:** 
    *   Na tela do portal, utilize o console de simulação de chat para interagir com o agente.
    *   Faça perguntas como: *"Quanto custa o desenvolvimento do site?"* ou *"A YUX integra com meu CRM?"*.
    *   A IA responderá com base no nosso FAQ oficial. Se você demonstrar interesse real e agendar uma reunião de diagnóstico, observe em tempo real o lead ser movido para a etapa **"Reunião Agendada"** no Kanban do CRM.

#### 3. Agente CRM Supervisor (Gestão Interna)
*   **O que ele faz:** Analisa o funil do CRM, avisa sobre oportunidades paradas e gera resumos de diagnóstico dos clientes.
*   **Como demonstrar:** 
    *   No menu do Dashboard, acesse a seção **"AI Briefing"**.
    *   Veja o relatório diário gerado para o gestor: análise de leads quentes do dia, alertas de projetos sem interação recente e sugestões de otimização de campanhas Ads.

---

## 👥 Perfis de Usuários para Teste

Faça login em `http://localhost:3000` com os seguintes perfis para demonstrar os níveis de permissão e visibilidade:

```
🔑 Administrador (André / Founder)
    - Login: admin@yux.com.br
    - Senha: admin123
    - Acesso: Visão completa de BI, CRM, Projetos, Campanhas, Financeiro e Configurações de Agentes.

🔑 Gerente de Projetos (Freela / Parceiro)
    - Login: manager@yux.com.br
    - Senha: manager123
    - Acesso: Visualização e edição de Projetos, Clientes e Leads. Sem visibilidade das métricas de faturamento bruto da YUX.

🔑 Cliente YUX (Área do Cliente)
    - Login: cliente1@empresa.com
    - Senha: client123
    - Acesso: Portal do Cliente exclusivo. Apenas visualiza a linha do tempo do seu próprio projeto, relatórios de suas campanhas de Ads e botões de aprovação de materiais.
```

---

## 🎯 Roteiro de Demonstração Passo a Passo

### 1. Prospecção Ativa & Scraper (2 min)
```
1. No menu lateral, acesse "Módulo Outbound" ou clique em "Capturar Leads".
2. Defina uma busca (ex: "Clínicas de Estética" em "Bairro Centro").
3. Clique em "Disparar Varredura Ativa" (Simulando o fluxo n8n).
4. O sistema listará empresas encontradas. Clique em "Mover para CRM".
5. O lead aparecerá automaticamente na primeira coluna do seu Funil de Leads.
```

### 2. Prospecção por IA (3 min)
```
1. Navegue até a listagem de "Leads".
2. Selecione o lead recém-capturado e clique no ícone do robô (Agente Prospector).
3. Aguarde 3 segundos. O sistema exibirá o "Diagnóstico Digital por IA" e a "Mensagem Comercial de Abordagem" estruturada para envio via WhatsApp.
```

### 3. CRM & Kanban de Projetos (3 min)
```
1. Navegue para "Projetos".
2. Veja os cards de projetos organizados pelas fases de entrega da YUX.
3. Arraste um projeto de "Setup Técnico" para "Homologação". 
4. Entre com o login do cliente e note que a linha do tempo dele foi atualizada em tempo real!
```

### 4. Centro de Campanhas & ROI Tracker (3 min)
```
1. Navegue para "Campanhas".
2. Visualize o relatório integrado das contas de Google Ads e Meta Ads do cliente.
3. Clique em "Sincronizar Métricas" (Aciona o webhook n8n para atualizar dados).
4. O dashboard mostrará o cálculo do ROAS e o ROI gerado pelas nossas automações.
```

---

## 🔧 Endpoints de Simulação das APIs Inteligentes

Para testar a integração dos agentes e do n8n por ferramentas como cURL ou Postman, utilize os endpoints locais de simulação do nosso backend:

```bash
# 1. Simular recebimento de mensagem no WhatsApp (Inicia o fluxo do Agente Qualificador RAG)
curl -X POST http://localhost:3001/api/agents/chat/webhook \
  -H "Content-Type: application/json" \
  -d '{"lead_id": "id-do-lead", "message": "Gostaria de agendar uma reunião de diagnóstico, quais os horários disponíveis?"}'

# 2. Disparar análise ativa do Prospector sobre o site de um lead
curl -X POST http://localhost:3001/api/agents/prospect \
  -H "Content-Type: application/json" \
  -d '{"lead_id": "id-do-lead"}'

# 3. Solicitar briefing matinal do Agente CRM Supervisor
curl -X GET http://localhost:3001/api/agents/briefing \
  -H "Authorization: Bearer SEU_TOKEN_ADMIN"
```

---

## 📈 Tabela de Requisitos Validados pelo MVP

Demonstre como o sistema cumpre todos os requisitos estratégicos da YUX Soluções em IA:

*   [x] **Requisito 1 (Dashboard de BI):** Visão financeira completa para o administrador.
*   [x] **Requisito 2 (Gestão de Projetos):** Kanban de entregas interativo.
*   [x] **Requisito 3 (Área do Cliente):** Portal de transparência para acompanhamento do progresso.
*   [x] **Requisito 4 (Centro de Campanhas):** Painel unificado de Google e Meta Ads.
*   [x] **Requisito 5 (Autenticação baseada em Perfis):** Diferentes acessos para Admin, Manager e Clientes.
*   [x] **Requisito 6 (Motor de Captura Ativo - Outbound Scraper):** Varredura de dados geolocalizada via n8n.
*   [x] **Requisito 7 (Equipe Virtual Multiagente):** Automações inteligentes de análise de site (Prospector), atendimento com RAG (Qualificador) e relatórios operacionais (Supervisor).
*   [x] **Requisito 8 (Blueprints Replicáveis):** Migrations do Supabase estruturadas e templates JSON do n8n para clonagem ágil para novos clientes.

## 🎉 Conclusão
O YUX Client Management está pronto para servir como a **máxima prova de conceito** da empresa. Ele resolve a gestão interna da YUX e encanta os futuros clientes ao demonstrar, na prática, as exatas automações e tecnologias de inteligência artificial que estamos oferecendo ao mercado de PMEs.