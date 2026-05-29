# Deploy Vercel + Supabase - Sistema YUX

## 🚀 **Arquitetura de Produção**

```
┌─────────────────────────────────────────────────────────────┐
│                    Domínios YUX                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  yux.com.br                    app.yux.com.br              │
│  ┌─────────────────┐           ┌─────────────────┐          │
│  │   WordPress     │           │   Admin System  │          │
│  │   (VPS atual)   │           │   (Vercel)      │          │
│  │                 │           │                 │          │
│  │ • Site público  │           │ • React SPA     │          │
│  │ • Blog/Landing  │           │ • Dashboard     │          │
│  │ • SEO/Marketing │           │ • CRM/Projetos  │          │
│  └─────────────────┘           └─────────────────┘          │
│                                          │                  │
│                                          ▼                  │
│                                 ┌─────────────────┐         │
│                                 │   Supabase      │         │
│                                 │   (Backend)     │         │
│                                 │                 │         │
│                                 │ • PostgreSQL    │         │
│                                 │ • Auth          │         │
│                                 │ • API Auto      │         │
│                                 │ • Real-time     │         │
│                                 │ • Edge Functions│         │
│                                 └─────────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📦 **Stack de Produção**

### **Frontend (Vercel)**
- **Domínio**: app.yux.com.br
- **Framework**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Deploy**: Automático via Git
- **CDN**: Global (Vercel Edge Network)
- **SSL**: Automático

### **Backend (Supabase)**
- **Database**: PostgreSQL (500MB free)
- **Auth**: Supabase Auth (integrado)
- **API**: Auto-gerada + Edge Functions
- **Real-time**: WebSockets nativos
- **Storage**: Para uploads de arquivos
- **Dashboard**: Interface visual incluída

## 🛠 **Preparação do Projeto**

### **1. Estrutura Adaptada**
```
yux-client-management/
├── frontend/              # Deploy no Vercel
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   └── vercel.json       # Configuração Vercel
├── supabase/             # Configuração Supabase
│   ├── migrations/       # Migrations SQL
│   ├── functions/        # Edge Functions
│   └── config.toml       # Configuração local
├── scripts/
│   └── deploy.js         # Script de deploy
└── README-PRODUCTION.md
```

### **2. Configurações Necessárias**

#### **Frontend (Vercel)**
- Configuração de domínio customizado
- Variáveis de ambiente
- Redirects e rewrites
- Build otimizado

#### **Backend (Supabase)**
- Schema do banco de dados
- Row Level Security (RLS)
- Edge Functions para lógica customizada
- Configuração de Auth

## 🔧 **Configuração do Supabase**

### **Database Schema**
```sql
-- Será criado via migrations
-- Mesmo schema do Prisma, adaptado para Supabase
```

### **Row Level Security (RLS)**
```sql
-- Políticas de segurança por role
-- Admin: acesso total
-- Manager: acesso a clientes e projetos
-- Client: acesso apenas aos próprios dados
```

### **Auth Configuration**
```json
{
  "site_url": "https://app.yux.com.br",
  "additional_redirect_urls": [
    "http://localhost:3000"
  ],
  "jwt_expiry": 3600,
  "refresh_token_rotation_enabled": true,
  "security_update_password_require_reauthentication": true
}
```

## 🚀 **Processo de Deploy**

### **Passo 1: Configurar Supabase**
1. Criar projeto no Supabase
2. Executar migrations
3. Configurar RLS policies
4. Configurar Auth settings
5. Obter URL e API keys

### **Passo 2: Configurar Vercel**
1. Conectar repositório GitHub
2. Configurar domínio app.yux.com.br
3. Definir variáveis de ambiente
4. Configurar build settings

### **Passo 3: Deploy Automático**
```bash
git push origin main
# Vercel faz deploy automático
# Supabase sincroniza migrations
```

## 📋 **Checklist de Deploy**

### **Preparação**
- [ ] Código adaptado para Supabase
- [ ] Migrations SQL criadas
- [ ] RLS policies definidas
- [ ] Edge Functions implementadas
- [ ] Frontend configurado para Vercel

### **Supabase Setup**
- [ ] Projeto criado
- [ ] Database configurado
- [ ] Auth configurado
- [ ] Policies aplicadas
- [ ] Edge Functions deployadas

### **Vercel Setup**
- [ ] Repositório conectado
- [ ] Domínio configurado
- [ ] Variáveis de ambiente definidas
- [ ] Build testado
- [ ] Deploy realizado

### **Pós-Deploy**
- [ ] Testar autenticação
- [ ] Testar CRUD operations
- [ ] Verificar RLS policies
- [ ] Testar em diferentes roles
- [ ] Configurar monitoramento

## 💰 **Custos (Plano Free)**

```
Vercel:
- Hosting: $0/mês
- Bandwidth: 100GB/mês (free)
- Build time: 6000 min/mês (free)

Supabase:
- Database: $0/mês (500MB)
- Auth: $0/mês (50k MAU)
- Storage: $0/mês (1GB)
- Edge Functions: $0/mês (500k invocations)

Total: $0/mês
```

## 📊 **Limites do Plano Free**

### **Vercel**
- ✅ Bandwidth: 100GB/mês (suficiente para 10k+ usuários)
- ✅ Build time: 6000 min/mês (100+ deploys)
- ✅ Domains: Ilimitados
- ✅ SSL: Automático

### **Supabase**
- ✅ Database: 500MB (suficiente para milhares de registros)
- ✅ Auth: 50k usuários ativos/mês
- ✅ API requests: Ilimitadas
- ✅ Real-time: 200 conexões simultâneas

## 🔄 **Migração Futura**

### **Quando escalar:**
```
Vercel Pro: $20/mês
- Bandwidth: 1TB/mês
- Build time: Ilimitado
- Analytics avançado

Supabase Pro: $25/mês
- Database: 8GB
- Auth: 100k MAU
- Storage: 100GB
- Priority support
```

## 🛡 **Segurança**

### **Supabase RLS**
```sql
-- Exemplo de policy para clientes
CREATE POLICY "Clients can view own data" ON clients
FOR SELECT USING (auth.uid() = user_id);

-- Exemplo de policy para admins
CREATE POLICY "Admins can view all" ON clients
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('ADMIN', 'MANAGER')
  )
);
```

### **Vercel Security**
- HTTPS obrigatório
- Headers de segurança automáticos
- DDoS protection
- Edge caching seguro

## 🎯 **Vantagens desta Stack**

### **Desenvolvimento**
- ✅ **Setup em 30 minutos** vs horas
- ✅ **Deploy automático** via Git push
- ✅ **Preview deployments** para cada PR
- ✅ **Hot reload** em desenvolvimento

### **Operacional**
- ✅ **Zero manutenção** de servidor
- ✅ **Backup automático** do Supabase
- ✅ **SSL automático** do Vercel
- ✅ **CDN global** incluído

### **Escalabilidade**
- ✅ **Auto-scaling** do Vercel
- ✅ **Connection pooling** do Supabase
- ✅ **Edge functions** para lógica customizada
- ✅ **Real-time** nativo

### **Custo**
- ✅ **$0/mês** para começar
- ✅ **Pay-as-you-grow** quando escalar
- ✅ **Sem custos ocultos**

Esta stack é **perfeita** para o sistema YUX: moderna, escalável, econômica e com zero manutenção!