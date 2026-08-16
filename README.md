# Atlantis-X AI Command Center

واجهة تشغيلية عربية لفريق **Atlantis-X AI Workforce v2.4** ضمن حزمة التشغيل **2.4.0**، يقوده **ORION** كمدير تقني AI واحد أمام المستخدم. يحوّل المشروع تصور «شركة AI داخل بيئة العمل» إلى مركز قيادة متكامل: يحدد القائد الهدف، يحلله Orion عبر نموذج حقيقي عند ربط BYOK، ثم ينسّق الفريق الداخلي ضمن بوابات أمن وقرار وسجل تدقيق دائم.

## ما تم بناؤه

- لوحة قيادة RTL داكنة ومتجاوبة لحالة المشروع والمهام ومسارات العمل.
- تطبيق PWA قابل للتثبيت بأيقونة مستقلة على Windows وAndroid وiPhone/iPad وmacOS وLinux.
- 11 موظف AI بعقد تشغيلي كامل: هوية ومهمة ومهارات وذاكرة محددة النطاق وأدوات وصلاحيات وKPIs وصف حي وقنوات تواصل وتسلسل تقارير وتصعيد.
- قناة CEO → Orion واحدة: Orion هو الـAI CTO المسؤول أمام المستخدم ويُفوّض داخليًا إلى الموظفين المتخصصين بدل مطالبة المستخدم بإدارة أدوات منفصلة.
- إعداد BYOK رسومي داخل التطبيق يدعم ست عائلات API فعلية: OpenAI-compatible وAzure OpenAI وAnthropic وGemini وCohere وOllama.
- اتصال الويب لا يُفعّل إلا بعد إذن القائد، تأكيد الرجوع، ونجاح استدلال health challenge حقيقي. المفتاح يبقى في ذاكرة عملية الخادم لهذه الجلسة فقط، ولا يُكتب إلى SQLite أو Git أو App Shell.
- هدف المستخدم ينتقل إلى `/api/cto/run` فقط عندما تكون جلسة النموذج متصلة؛ وإلا يبقى Orion في وضع التنسيق الحتمي المحلي بوسم واضح.
- ذاكرة استمرارية محدودة تمرر إلى Orion آخر أربع خلاصات خطط فقط بعد ضبط الطول وتنقيح أنماط الأسرار؛ ولا تمرر الإجابات الكاملة أو payload المزود أو المفتاح، وتبقى الذاكرة سياقًا لا سلطة.
- خطة CTO تشمل سبب كل تفويض، المخرج، الاعتماديات، تقدير الجهد، معيار القبول، مؤشرات النجاح، وبوابة الموافقة؛ وتدعم الأدوار الـ11 وتُنزّل كـMarkdown execution brief.
- يستطيع القائد طلب تنقيح الخطة نفسها من نافذة النتيجة. يعيد Orion خطة بديلة كاملة برقم revision جديد، يعيد بوابات سير العمل إلى حالة المراجعة، ويحفظ آخر ست خلاصات revisions فقط بعد ضبط الطول وتنقيح أنماط الأسرار. لا يستطيع التنقيح إسقاط متطلب موافقة قائم.
- تعرض النتيجة evidence منفصلًا: نجاح استدلال النموذج، نجاح حفظ الخطة، وعدم وجود دليل على تنفيذ خارجي. بذلك لا تختلط الخطة المولدة مع ادعاء إنجاز العمل.
- مسار readiness محمي يتحقق من سجل Workforce وSQLite وقفل الأتمتة الخارجية وملفات PWA، مع اعتبار جلسة المزود فحصًا اختياريًا.
- دورة حالات كاملة: `PLAN → EXECUTE → REVIEW → SECURITY → APPROVAL → RELEASE → COMPLETE`.
- تشغيل مستقل افتراضيًا حتى الاكتمال أو حتى أقرب بوابة سيادية.
- سجل Audit لكل انتقال وتغيير يدوي وقرار، مع المنفّذ والنتيجة والتوقيت.
- نافذة قرار سيادي صريحة للموافقة أو الرفض مع ملاحظة تحفظ في السجل.
- تخزين runtime انتقل من JSON إلى SQLite بمعاملات ذرية وWAL، مع استيراد تلقائي غير مدمر للحالة القديمة.
- سجل قدرات `default-deny`: الأتمتة الخارجية متوقفة حتى تسجل موافقة صريحة وفحص صحة وخطة رجوع.
- حماية اختيارية لكل Control API عبر `ATLANTISX_COMMANDER_KEY` ومفتاح Bearer محفوظ في جلسة المتصفح فقط.
- مصدر Tauri 2 أصلي لسطح المكتب والموبايل مع خزنة SQLCipher/Argon2، محرك الفريق الكامل، سجل تسليم Agent2Agent محلي، فرق البشر والوكلاء وهويات الأجهزة، مهارات `SKILL.md`، ترحيل مشفّر، وأهداف متكررة معطلة افتراضيًا.
- كتالوج 22 مزود AI وواجهة BYOK أصلية؛ 21 تعريفًا يستخدم عائلات بروتوكول منفذة ويبقى غير مهيأ، بينما AWS Bedrock معلّم بوضوح كغير تشغيلي حتى إضافة AWS SigV4. التفعيل يتطلب الإذن وفحص صحة شبكيًا وخطة رجوع.

> حالة التكاملات معروضة بصدق: لا يوجد مزود AI متصل افتراضيًا. زر **ORION CTO · SETUP** يطلب مفتاح المستخدم ويثبت الاتصال باستجابة نموذج حقيقية؛ لا يمثل وجود اسم مزود في الكتالوج حسابًا مهيأ. GitHub متاح كمستودع محلي فقط، وتبقى Notion وAirtable وPostHog والنشر وبقية الأتمتة الخارجية غير مفعلة.

## تشغيل Orion CTO من الواجهة

1. افتح رابط PWA واضغط **ORION CTO · SETUP** أو **Connect Orion CTO**.
2. اختر المزود؛ ستملأ الواجهة endpoint واسم model الافتراضيين. Azure يتطلب نطاق مورد `*.openai.azure.com`، والمزود المحلي يتطلب loopback على الجهاز الذي يشغّل خادم Atlantis-X.
3. أدخل API key، وافق على الوصول المحدود للنموذج، وأكد أن **Disconnect** هو خطة الرجوع.
4. اضغط **Verify provider & activate CTO**. لا تعرض الواجهة حالة LIVE إلا بعد نجاح طلب inference فعلي يعيد challenge المتوقع.
5. أعطِ Orion هدفك من اللوحة. يعرض التطبيق الإجابة، المخاطر، الافتراضات، مؤشرات النجاح، وخطوات التفويض المرتبة مع السبب والمخرج والاعتماديات والجهد ومعيار القبول.
6. إذا احتاجت الخطة تعديلًا، اكتب توجيهك في **REFINE WITH ORION**. يستخدم Orion خلاصة الخطة الحالية فقط، ينشئ replacement كاملة، يزيد رقم revision، ويلغي أثر أي موافقات workflow سابقة كي تُراجع النسخة الجديدة.
7. راجع شريط **VERIFIED EVIDENCE**: يفرق بين inference موثّق، خطة محفوظة، وتنفيذ خارجي غير منفّذ. ثم نزّل **Execution brief (.md)** لتسليم الخطة أو مراجعتها خارج الواجهة.

الاتصال يمنح Orion **استدلالًا وتخطيطًا فقط**. لا يحصل النموذج على أدوات filesystem أو browser أو desktop أو دفع أو نشر أو deployment. الخطة لا تعني تنفيذ أثر خارجي، وتظل العمليات السيادية وعالية الخطورة عند بوابة موافقة القائد. لا تضع مفاتيح أو كلمات مرور في الهدف أو توجيه التنقيح.

## التثبيت للمستخدم — دون Docker أو Terminal

1. افتح النسخة المستضافة عبر HTTPS في Edge أو Chrome أو Safari.
2. اضغط **تثبيت التطبيق** في الشريط العلوي.
3. على Windows وAndroid وافق على نافذة تثبيت المتصفح.
4. على iPhone/iPad افتح Safari ثم **مشاركة ← إضافة إلى الشاشة الرئيسية ← إضافة**.

سيظهر Atlantis-X بأيقونته كتطبيق مستقل. يحتوي المشروع على `manifest.webmanifest` وService Worker وأيقونات PWA/Apple/Windows. واجهة التطبيق ذاتية الموارد ولا تجلب خطوطًا أو سكربتات من طرف ثالث، ولا يتم تخزين استجابات `/api` داخل Cache الخاص بالـService Worker.

هذه نسخة PWA حقيقية قابلة للتثبيت. أما ملفات `.exe` و`.msi` و`.apk` و`.aab` و`.ipa` فتتطلب بناءً وتوقيعًا على Windows/Android/macOS؛ لا يحتوي المستودع على تنزيلات وهمية غير موقعة. يتوفر تعريف CI متعدد المنصات كقالب غير نشط في `docs/workflows/native-build.yml.example` إلى أن يثبته مالك المستودع بصلاحية GitHub Workflows. راجع [`docs/NATIVE_APP.md`](docs/NATIVE_APP.md).

## تشغيل الخادم للمطور أو الاستضافة

يتطلب Python 3.9 أو أحدث، ولا يحتاج إلى تثبيت حزم.

### وضع محلي أحادي المستخدم

```bash
python server.py --host 0.0.0.0 --port 4173
```

### تشغيل محمي بمفتاح القائد

استخدم قيمة طويلة وعشوائية من 16 محرفًا على الأقل ولا تحفظها في Git:

```bash
export ATLANTISX_COMMANDER_KEY="replace-with-a-long-random-secret"
python server.py --host 0.0.0.0 --port 4173
```

ثم افتح `http://localhost:4173`. تحتفظ الواجهة بالمفتاح في `sessionStorage` للجلسة الحالية فقط. خطوات preflight وTLS وreadiness والنسخ الاحتياطي والرجوع وبناء كل منصة موثقة في [`docs/OPERATIONS_RUNBOOK.md`](docs/OPERATIONS_RUNBOOK.md).

## تشغيل الخادم بالحاوية — اختياري

لا يحتاج مستخدم التطبيق إلى Docker. يبقى Compose خيارًا لمشغّل الخادم فقط:

```bash
export ATLANTISX_COMMANDER_KEY="replace-with-a-long-random-secret"
docker compose up --build
```

- الخدمة تستمع على المنفذ `4173`.
- SQLite تحفظ في volume باسم `atlantisx-state`.
- العملية تعمل داخل الحاوية كمستخدم غير root.
- `/api/health` مستخدم كـDocker health check.

## الاختبارات والتحقق

```bash
python -m unittest discover -s tests -v
node --check web/app.js
python -m py_compile server.py cto_agent.py
python -m json.tool config/workforce.json >/dev/null
python -m json.tool config/capabilities.json >/dev/null
python -m json.tool config/providers.json >/dev/null
python -m json.tool src-tauri/tauri.conf.json >/dev/null
```

## الملفات الرئيسية

```text
web/
  index.html                 واجهة مركز القيادة وتجربة التثبيت
  styles.css + cto.css       نظام التصميم المتجاوب وسطح Orion CTO
  app.js                     التفاعل والمصادقة وBYOK وتثبيت PWA وجسر الخزنة الأصلية
  manifest.webmanifest       تعريف التطبيق عبر المنصات
  service-worker.js          App Shell؛ يستثني Control API
  assets/icons/              أيقونات Windows وApple وPWA
config/
  workforce.json             سجل الموظفين والحالة الأساسية
  capabilities.json          سجل القدرات وبوابات التفعيل الثلاث
  providers.json             كتالوج مزودي AI المعطل افتراضيًا
src-tauri/
  src/vault.rs               خزنة SQLCipher أصلية وArgon2 ومخطط البيانات
  src/runtime.rs             سير العمل وA2A والمزودون والمهارات والترحيل والفرق والجداول
  Cargo.lock                 قفل dependency graph الأصلي القابل لإعادة الإنتاج
  tauri.conf.json            حزم Windows/macOS/Linux/Android/iOS
rust-toolchain.toml           تثبيت Rust 1.88.0 للمطور وCI
server.py                    الخادم والمحرك وSQLite وPolicy Gate
cto_agent.py                 بوابة Orion CTO المقيدة وموصلات inference للجلسة
docs/
  AI_WORKFORCE_ARCHITECTURE.md
  NATIVE_APP.md
  OPERATIONS_RUNBOOK.md       خطوات التشغيل والنشر والرجوع وبناء المنصات وقائمة قبول الإصدار
  workflows/native-build.yml.example  قالب تحقق أصلي متعدد المنصات يثبته مالك المستودع
tests/
  test_command_center.py     اختبارات المحرك المحلي
  test_cto_agent.py          موصلات CTO ودورة المفتاح والمخاطر ومسارات HTTP
```

## Runtime API

```text
GET  /api/health                  liveness عام
GET  /api/readiness               readiness محمي؛ يعيد 503 عند فشل شرط مطلوب
GET  /api/state
POST /api/cto/connect           {"provider_id": "...", "endpoint": "...", "model": "...", "secret": "...", "permission_granted": true, "rollback_ready": true}
POST /api/cto/run               {"command": "..."}
POST /api/cto/disconnect        {}
POST /api/commands              {"command": "...", "autorun": true}
POST /api/tasks/{id}/cto/refine {"instruction": "..."}
POST /api/tasks/{id}/run        {"mode": "next|until_gate"}
POST /api/tasks/{id}/decision   {"decision": "approve|reject", "note": "..."}
POST /api/tasks/{id}/status     {"status": "..."}
```

عند ضبط مفتاح القائد، تتطلب كل مسارات Control API — بما فيها `/api/readiness` — باستثناء `/api/health`:

```text
Authorization: Bearer <ATLANTISX_COMMANDER_KEY>
```

## حدود الأمان الحالية

- يحفظ خادم الويب runtime في `.atlantisx/atlantisx.db` باستخدام SQLite وWAL؛ الملف مستبعد من Git لكنه **غير مشفر**، لذلك لا يخزن أسرارًا.
- خزنة التطبيق الأصلي في `src-tauri` تستخدم SQLCipher لتشفير قاعدة البيانات كاملة وArgon2 لاشتقاق المفتاح. ثُبّتت تبعيات Rust في `Cargo.lock` وضُبط المصدر بـ`rustfmt` حقيقي، لكن لم تُبنَ الحزم الأصلية لأن تنزيل crate payloads ومكتبات المنصة وSDKs والتوقيع غير متاح في هذه البيئة.
- لا تحفظ مفاتيح API داخل المستودع أو قاعدة Runtime غير المشفرة. جلسة CTO في الويب تحتفظ بمفتاح واحد في ذاكرة عملية Python فقط حتى disconnect أو restart؛ أما التخزين الدائم الآمن فهو للخزنة الأصلية SQLCipher بعد بناء Tauri.
- endpoint المزود المستضاف مقيد بنطاق المزود المختار وHTTPS/443؛ وendpoint المحلي مقيد بـHTTP loopback. لا تُتبع redirects وتُحد الاستجابة بـ1 MiB.
- `config/capabilities.json` يبقي كل قدرة خارجية معطلة حتى تمر الموافقة وفحص الصحة وخطة الرجوع.
- عند اتصال مزود حقيقي يصبح تحليل CTO مولّدًا بالنموذج؛ دون اتصال يبقى المسار حتميًا ويظهر ذلك في الواجهة. لا يوجد ماسح ثغرات أو موصل SaaS أو منفذ أدوات غير مهيأ.
- حتى مع النموذج، يسجل `RELEASE` إصدارًا محليًا فقط، مع `external_effects_enabled: false`. استدلال المزود لا يمنحه أداة لتنفيذ الخطة.
- قبل نشر عام، استخدم TLS وReverse Proxy موثوقًا وRate Limiting وهوية مركزية، ويفضل OIDC بدل المفتاح المشترك.
