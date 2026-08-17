# N3mak Bot Server

> 🤖 سيرفر بوت تيليجرام لمنصة N3mak — استثمار عالمي ذكي بين يديك.
> AI-powered global investment platform — Telegram bot server (Node.js + Telegraf + Express + Postgres + Redis).

<div align="center">

**🌍 Invest in US · Europe · GCC · UK · Russia · Africa**

[🇺🇸 English](#-english) · [🇸🇦 العربية](#-العربية) · [🇷🇺 Русский](#-русский)

</div>

---

## 🇸🇦 العربية

**N3mak** — منصتك الذكية للاستثمار العالمي 🌍💰
استثمر بذكاء اصطناعي في الأسواق العالمية (أمريكا، أوروبا، الخليج، بريطانيا، روسيا، أفريقيا) من هاتفك مباشرة.

- ✅ إدارة استثماراتك أونلاين بالكامل
- ✅ دعم متعدد العملات (USD, AED)
- ✅ دفع ولوجستيات متكاملة
- ✅ حماية من السبام (Rate limiting) عبر Redis

### الأوامر المدعومة
`/start` · `/help` · `/invest` · `/portfolio` · `/deposit` · `/withdraw` · `/markets` · `/support` · `/referral` · `/language`

### النشر على Railway
1. اربط هذا الريبو بخدمة `api` في مشروع `n3mak-api` على Railway
2. أضف المتغيرات: `TELEGRAM_BOT_TOKEN` · `DATABASE_URL` · `REDIS_URL` · `PORT`
3. بعد أول ديبلوي، ولّد دومين عام للخدمة
4. أضف `PUBLIC_URL=https://<your-domain>.up.railway.app` وأعد التشغيل
5. سيتم تسجيل الـ Webhook تلقائياً مع تيليجرام

---

## 🇺🇸 English

**N3mak** — Your Smart Global Investment Platform 🌍💰
AI-powered investing across global markets (US, Europe, GCC, UK, Russia, Africa) — right from your phone.

- ✅ Fully online investment management
- ✅ Multi-currency support (USD, AED)
- ✅ Integrated payments & logistics
- ✅ Anti-flood protection via Redis rate limiting

### Supported commands
`/start` · `/help` · `/invest` · `/portfolio` · `/deposit` · `/withdraw` · `/markets` · `/support` · `/referral` · `/language`

### Features
- **Webhook mode** for production (auto-enabled when `PUBLIC_URL` is set)
- **Rate limiting** — 20 messages/minute per user (anti-spam)
- **Postgres auto-migration** on first boot (`users`, `portfolios`)
- **Health check** at `/api/health`

### Deploy on Railway
1. Connect this repo to an `api` service on Railway
2. Set env vars: `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, `REDIS_URL`, `PORT`
3. After the first deploy, generate a public domain
4. Add `PUBLIC_URL=https://<your-domain>.up.railway.app` and restart
5. The webhook will be registered with Telegram automatically

### Local development
```bash
npm install
TELEGRAM_BOT_TOKEN=... npm run dev
```

---

## 🇷🇺 Русский

**N3mak** — Ваша умная платформа для глобальных инвестиций 🌍💰
Инвестируйте с помощью ИИ на мировых рынках (США, Европа, страны Персидского залива, Великобритания, Россия, Африка) — прямо с телефона.

- ✅ Полностью онлайн управление инвестициями
- ✅ Поддержка нескольких валют (USD, AED)
- ✅ Интегрированные платежи и логистика
- ✅ Защита от спама через Redis (ограничение частоты)

### Поддерживаемые команды
`/start` · `/help` · `/invest` · `/portfolio` · `/deposit` · `/withdraw` · `/markets` · `/support` · `/referral` · `/language`

### Деплой на Railway
1. Подключите этот репозиторий к сервису `api` в Railway
2. Установите переменные: `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, `REDIS_URL`, `PORT`
3. После первого деплоя сгенерируйте публичный домен
4. Добавьте `PUBLIC_URL=https://<your-domain>.up.railway.app` и перезапустите
5. Webhook будет автоматически зарегистрирован в Telegram

---

## 🛠 Tech stack

| Layer | Tech |
|-------|------|
| Bot framework | [Telegraf](https://telegraf.js.org/) 4.x |
| HTTP server | Express 4.x |
| Database | PostgreSQL (`pg` driver) |
| Cache & rate limit | Redis (`ioredis`) |
| Runtime | Node.js ≥ 18 |

> ℹ️ A reference Node.js CI workflow lives at [`docs/ci/node.js.yml`](docs/ci/node.js.yml). Copy it to `.github/workflows/` (with the required `workflows` permission on your GitHub App) if you want CI on push.

## 📁 Project structure

```
.
├── .env.example          # Environment variable template
├── .github/workflows/    # Node.js CI
├── package.json
├── README.md
└── src/
    ├── index.js          # Express + Telegraf bootstrap, webhook/polling switch
    ├── commands.js       # /start, /help, /invest, /portfolio, ...
    ├── db.js             # Postgres pool + auto-migration + upsertUser
    └── redis.js          # ioredis client + checkRateLimit()
```

## 🔐 BotFather description (≤ 512 chars)

> **N3mak - Your Smart Global Investment Platform 🌍💰**
> AI-powered investing across global markets (US, Europe, GCC, UK, Russia, Africa) — right from your phone.
> ✅ Fully online investment management
> ✅ Multi-currency support (USD, AED)
> ✅ Integrated payments & logistics
> Start your investment journey with N3mak.

## 📄 License

Private — © N3mak.
