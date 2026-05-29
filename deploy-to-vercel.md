# 🚀 Deploy to Vercel - Quick Guide

## ✅ **Pré-requisitos Concluídos**
- ✅ Supabase database configurado
- ✅ Tabelas criadas com RLS
- ✅ Dados de teste inseridos
- ✅ Usuário admin criado: `admin@yux.com.br` / `admin123`

## 🎯 **Credenciais do Supabase**
```
Project URL: https://drpvkpcuaqtdhyuzhxiw.supabase.co
Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRycHZrcGN1YXF0ZGh5dXpoeGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTY3NTYsImV4cCI6MjA3MzA5Mjc1Nn0.rzeh8jnDbT1iYesuBZPlCPDoZ2AhhrhC3dDzKxl52lQ
```

## 📋 **Passos para Deploy no Vercel**

### **1. Preparar o Repositório**
```bash
# Navegar para o projeto
cd yux-client-management

# Adicionar arquivos ao git (se ainda não estiver)
git add .
git commit -m "feat: sistema completo pronto para deploy"
git push origin main
```

### **2. Configurar no Vercel Dashboard**

#### **2.1 Criar Novo Projeto**
1. Acesse: https://vercel.com/dashboard
2. Clique em **"New Project"**
3. Conecte seu repositório GitHub
4. Selecione o repositório `yux-client-management`

#### **2.2 Configurar Build Settings**
```
Framework Preset: Vite
Root Directory: frontend
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

#### **2.3 Configurar Environment Variables**
No dashboard do Vercel, vá em **Settings > Environment Variables** e adicione:

```
VITE_SUPABASE_URL = https://drpvkpcuaqtdhyuzhxiw.supabase.co
VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRycHZrcGN1YXF0ZGh5dXpoeGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTY3NTYsImV4cCI6MjA3MzA5Mjc1Nn0.rzeh8jnDbT1iYesuBZPlCPDoZ2AhhrhC3dDzKxl52lQ
```

#### **2.4 Deploy**
1. Clique em **"Deploy"**
2. Aguarde o build (2-3 minutos)
3. Acesse a URL gerada (ex: `https://yux-client-management.vercel.app`)

### **3. Configurar Domínio Personalizado (Opcional)**

#### **3.1 No Vercel**
1. Vá em **Settings > Domains**
2. Adicione: `app.yux.com.br`

#### **3.2 No seu DNS Provider**
Adicione um registro CNAME:
```
Type: CNAME
Name: app
Value: cname.vercel-dns.com
```

### **4. Configurar Auth no Supabase**

#### **4.1 Site URL**
No Supabase Dashboard:
1. Vá em **Authentication > Settings**
2. Site URL: `https://yux-client-management.vercel.app` (ou seu domínio personalizado)

#### **4.2 Redirect URLs**
Adicione:
```
https://yux-client-management.vercel.app/**
https://app.yux.com.br/** (se usando domínio personalizado)
```

## 🧪 **Testar o Deploy**

### **1. Acesso Básico**
1. Acesse sua URL do Vercel
2. Faça login com: `admin@yux.com.br` / `admin123`
3. Verifique se o dashboard carrega

### **2. Verificar Dados**
- Dashboard deve mostrar métricas dos dados de teste
- Clientes: 2 empresas (Empresa ABC, XYZ Corporation)
- Projetos: 3 projetos em diferentes estágios
- Campanhas: 3 campanhas (Google + Meta)
- Leads: 3 leads no pipeline

## 🎉 **Deploy Concluído!**

Seu sistema YUX está agora rodando em produção:
- **Frontend**: URL do Vercel (ou app.yux.com.br)
- **Database**: Supabase (totalmente configurado)
- **Auth**: Supabase Auth (integrado)

### **Próximos Passos:**
1. ✅ Mudar senha do admin após primeiro login
2. ✅ Criar usuários reais para a equipe
3. ✅ Configurar integrações com Google Ads e Meta Ads
4. ✅ Personalizar dados conforme necessidade

**O sistema está 100% funcional e pronto para uso! 🚀**