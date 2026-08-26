# N3mak Bot Server

سيرفر بوت تيليجرام أساسي لمنصة N3mak — Node.js + Telegraf + Express، متصل بـ Postgres وRedis.

## الأوامر المدعومة
/start /help /invest /portfolio /deposit /withdraw /markets /support /referral /language

## يشمل
- Webhook mode جاهز للإنتاج (يفعّل تلقائياً لو `PUBLIC_URL` متظبط)
- Rate limiting (anti-flood) عبر Redis — 20 رسالة/دقيقة لكل مستخدم
- إنشاء جداول Postgres تلقائياً عند أول تشغيل (`users`, `portfolios`)
- Health check على `/api/health`

## النشر على Railway
1. push الكود ده لريبو GitHub (خطوات تحت)
2. اربط الريبو بخدمة `api` في مشروع `n3mak-api` على Railway
3. تأكد المتغيرات دي موجودة في الخدمة: `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, `REDIS_URL`, `PORT`
4. بعد أول ديبلوي، ولّد دومين عام للخدمة، وضيف متغير `PUBLIC_URL` بقيمة الدومين ده (مثال: `https://n3mak-api-production.up.railway.app`)
5. أعد تشغيل الخدمة — هيسجل الـ Webhook تلقائياً مع تيليجرام

## رفع الكود لـ GitHub
```
cd n3mak-bot-server
git init
git add .
git commit -m "N3mak bot server - initial version"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main --force
```
