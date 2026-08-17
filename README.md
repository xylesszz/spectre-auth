# 🔐 SPECTRE AUTH

Plataforma premium de autenticação (estilo KeyAuth) para loaders e aplicações desktop.
Painel administrativo + API REST v1 + SDKs C++/C# com proteções anti-crack.

---

## ✨ Funcionalidades

### Painel Administrativo
- 📊 **Dashboard** com estatísticas em tempo real
- 📦 **Applications** — multi-aplicação com credenciais isoladas (`publicId` + `secret`)
- 🎫 **Licenses** — gerador em massa, keys customizadas ou aleatórias (sem símbolos), duração, max ativações, HWID lock
- 👤 **Users** — criação com username 1+ alfanumérico, ban/unban, reset HWID, sessões
- 🛡️ **Security** — blacklists/whitelists (IP, HWID, USER, LICENSE), maintenance mode
- 🔑 **Tokens & Variables** — pré-autenticação e variáveis globais servidas via API
- 📜 **Audit Logs** — trilha completa de ações (admin + API)
- 🔔 **Webhooks Discord** — notificações server-side e client-side (SDK)

### API REST v1
| Endpoint | Descrição |
|---|---|
| `POST /api/v1/init` | Checa status da aplicação |
| `POST /api/v1/auth/register` | Registra user + ativa licença |
| `POST /api/v1/auth/login` | Login + cria sessão (`sst_...`) |
| `POST /api/v1/auth/logout` | Encerra sessão |
| `POST /api/v1/license/activate` | Ativa licença (bind HWID/app) |
| `POST /api/v1/license/validate` | Valida licença |
| `POST /api/v1/session/validate` | Valida sessão ativa |
| `POST /api/v1/variables` | Variáveis globais da aplicação |
| `POST /api/v1/token/validate` | Valida token de pré-auth |

**Headers obrigatórios:** `X-App-Id`, `X-App-Secret` (+ `X-Session-Token` após login)

### SDKs (C++ / C#)
- ⚙️ Configuração isolada no próprio SDK (bloco `SpectreConfig`)
- 🔔 Webhook Discord automático no login (User, Password, License, HWID, IP, Dispositivo, Data, Expira)
- 🛡️ Anti-debugger, anti-hook, anti-ferramentas de crack
- 🔒 Secrets ofuscados em memória (XOR + `SecureZeroMemory`)
- 🌐 HTTPS obrigatório (anti-MITM)
- 💻 HWID via WMI + SHA256

---

## 🧱 Stack

- **Next.js 14** (App Router) + TypeScript
- **Prisma ORM** + **PostgreSQL (Supabase)**
- **Vercel** (plano Hobby/Free)
- **bcryptjs** (hash de secrets/senhas)
- **WinHTTP / HttpClient** (SDKs)

---

## 🚀 Quick Start (Local)

```bash
# 1. Instalar dependências
npm install

# 2. Configurar .env (veja seção abaixo)

# 3. Sincronizar banco
npx prisma db push

# 4. (Opcional) Criar admin legado
npm run bootstrap

# 5. Rodar
npm run dev