# Atlantis-X AI Command Center

واجهة تشغيلية عربية لفريق **Atlantis-X AI Workforce v2.1**. يحوّل المشروع تصور «شركة AI داخل بيئة العمل» إلى مركز قيادة متكامل قابل للتشغيل، مع سلطة CEO واحدة، سجل موظفين موحّد، محرك دورات مستقل، صفوف عمل، بوابات أمن وقرار، وسجل تدقيق دائم.

## ما تم بناؤه

- لوحة قيادة RTL داكنة ومتجاوبة لحالة المشروع والمهام ومسارات العمل.
- 11 موظف AI بعقد تشغيلي كامل: هوية ومهمة ومهارات وذاكرة محددة النطاق وأدوات وصلاحيات وKPIs وصف حي وقنوات تواصل وتسلسل تقارير وتصعيد.
- قناة CEO → Orion تنشئ توجيهًا وتوزعه ثم تشغّل المراحل المحلية الآمنة تلقائيًا.
- Router حتمي وقابل للتدقيق يوزّع التوجيه على الوحدة المناسبة.
- دورة حالات كاملة: `PLAN → EXECUTE → REVIEW → SECURITY → APPROVAL → RELEASE → COMPLETE`.
- تشغيل مستقل افتراضيًا حتى الاكتمال أو حتى أقرب بوابة سيادية.
- تشغيل يدوي لمرحلة واحدة أو للدورة كاملة من Runtime Console.
- سجل Audit لكل انتقال وتغيير يدوي وقرار، مع المنفّذ والنتيجة والتوقيت.
- نافذة قرار سيادي صريحة للموافقة أو الرفض مع ملاحظة تحفظ في السجل.
- حماية اختيارية لكل Control API عبر `ATLANTISX_COMMANDER_KEY` ومفتاح Bearer محفوظ في جلسة المتصفح فقط.
- مرحلة تنفيذ معزولة وRelease محلي؛ الآثار الخارجية متوقفة حتى تركيب موصل موثّق.
- قرارات لوحة القيادة مرتبطة بمهام فعلية عند بوابة الموافقة، وليست أزرارًا تجميلية.
- صفحات للفريق والمهام والمحرك والاستخبارات والأمن والتكاملات.
- Executive Brief ديناميكي من الحالة الحالية.
- مصدر حقيقة versioned في `config/workforce.json`.
- خادم بلا تبعيات خارجية، Health Check، حاوية غير root، واختبارات للتوجيه والسياسات والمصادقة.

> حالة التكاملات معروضة بصدق: GitHub متاح كمستودع محلي فقط، أما Notion وAirtable وPostHog والنشر الخارجي فتبقى «بانتظار الربط» حتى تضبط بيانات الاعتماد الآمنة ويجتاز الموصل فحص الصحة.

## التشغيل المحلي

يتطلب Python 3.9 أو أحدث، ولا يحتاج إلى تثبيت حزم.

### وضع تطوير محلي أحادي المستخدم

```bash
python server.py --host 0.0.0.0 --port 4173
```

### تشغيل محمي بمفتاح القائد

استخدم قيمة طويلة وعشوائية من 16 محرفًا على الأقل ولا تحفظها في Git:

```bash
export ATLANTISX_COMMANDER_KEY="replace-with-a-long-random-secret"
python server.py --host 0.0.0.0 --port 4173
```

ثم افتح `http://localhost:4173`. ستعرض الواجهة نافذة تحقق وتحتفظ بالمفتاح في `sessionStorage` للجلسة الحالية فقط.

## التشغيل بالحاوية

يتطلب Compose ضبط المفتاح قبل التشغيل:

```bash
export ATLANTISX_COMMANDER_KEY="replace-with-a-long-random-secret"
docker compose up --build
```

- الخدمة تستمع على المنفذ `4173`.
- الحالة تحفظ في volume باسم `atlantisx-state`.
- العملية تعمل داخل الحاوية كمستخدم غير root.
- `/api/health` مستخدم كـ Docker health check.

## الاختبارات والتحقق

```bash
python -m unittest discover -s tests -v
# أو بعد تثبيت pytest
pytest

node --check web/app.js
python -m py_compile server.py
python -m json.tool config/workforce.json >/dev/null
```

## الملفات الرئيسية

```text
web/
  index.html        واجهة مركز القيادة والنوافذ السيادية
  styles.css        نظام التصميم المتجاوب
  app.js            التفاعل والمصادقة والربط مع API
config/
  workforce.json    سجل الموظفين والحالة الأساسية
server.py           الخادم وCommand Router وPolicy Gate
Dockerfile          صورة تشغيل غير root مع Health Check
compose.yaml        تشغيل محمي وحفظ دائم للحالة
docs/
  AI_WORKFORCE_ARCHITECTURE.md
tests/
  test_command_center.py
```

## Runtime API

```text
GET  /api/health
GET  /api/state
POST /api/commands              {"command": "...", "autorun": true}
POST /api/tasks/{id}/run        {"mode": "next|until_gate"}
POST /api/tasks/{id}/decision   {"decision": "approve|reject", "note": "..."}
POST /api/tasks/{id}/status     {"status": "..."}
```

عند ضبط مفتاح القائد، تتطلب كل مسارات Control API باستثناء `/api/health`:

```text
Authorization: Bearer <ATLANTISX_COMMANDER_KEY>
```

## حدود الأمان الحالية

- يحفظ التشغيل في `.atlantisx/runtime.json`، وهو مستبعد من Git ويكتب ذريًا.
- لا تحفظ مفاتيح API أو بيانات الاعتماد داخل الواجهة أو المستودع.
- التنفيذ الحالي محلي وحتمي؛ لا يدّعي وجود LLM أو ماسح ثغرات أو موصل SaaS غير مهيأ.
- `RELEASE` يسجل إصدارًا محليًا فقط، مع `external_effects_enabled: false`.
- مفتاح القائد مناسب لحماية أولية أو شبكة خاصة. قبل نشر عام، ضع الخدمة خلف TLS وReverse Proxy موثوق، ويفضل موفر هوية/OIDC وصلاحيات متعددة المستخدمين.
