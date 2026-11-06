const KEY = 'n3k_...';
const MODEL = 'gpt-oss-20b';

function text(value) {
  return { text: value };
}

function code(value) {
  return { code: value };
}

export function toolGuides(baseUrl) {
  const base = baseUrl.replace(/\/$/, '');
  const chatUrl = `${base}/chat/completions`;

  return [
    {
      id: 'cursor',
      name: 'Cursor',
      docHref: 'https://help.openai.com/en/articles/20001506-using-openai-models-in-cursor',
      steps: {
        en: [
          [text('Open Cursor Settings → Models (macOS Cmd+Shift+J, Windows/Linux Ctrl+Shift+J).')],
          [text('Under API Keys, paste your key into OpenAI API Key: '), code(KEY), text('.')],
          [text('Turn on Override OpenAI Base URL.')],
          [text('Set the URL to '), code(base), text('. Include /v1. Do not append /chat/completions.')],
          [text('Add a custom model named '), code(MODEL), text('. Pioneer can also use '), code('llama-3.1-8b'), text('.')],
          [text('Select that model in Chat or the local Agent and send a test message.')],
        ],
        ar: [
          [text('افتح Cursor Settings → Models.')],
          [text('في OpenAI API Key ضع '), code(KEY), text('.')],
          [text('فعّل Override OpenAI Base URL.')],
          [text('الصق '), code(base), text(' بدون /chat/completions.')],
          [text('أضف نموذجاً مخصصاً: '), code(MODEL), text('. خطة Pioneer تقبل أيضاً '), code('llama-3.1-8b'), text('.')],
          [text('جرّبه في Chat أو Agent المحلي.')],
        ],
      },
      caveat: {
        en: 'The override applies to OpenAI-family traffic in local Chat and Agent. Turn it off to use Cursor subscription models again. It does not cover Cursor Tab, Auto, Cloud Agents, Automations, the CLI, or the Cursor API.',
        ar: 'التجاوز يشمل حركة نماذج OpenAI في Chat و Agent المحليين. أوقفه لتعود نماذج اشتراك Cursor. لا يشمل Cursor Tab أو Auto أو Cloud Agents أو الأتمتة أو سطر الأوامر أو واجهة Cursor.',
      },
    },
    {
      id: 'continue',
      name: 'Continue',
      docHref: 'https://docs.continue.dev/customize/model-providers/top-level/openai',
      steps: {
        en: [
          [text('Add this block to ~/.continue/config.yaml (or the project config), then reload Continue and pick N3mak gpt-oss-20b.')],
        ],
        ar: [
          [text('أضف هذا المقطع إلى config.yaml في Continue، ثم أعد تحميل الإضافة واختر N3mak gpt-oss-20b.')],
        ],
      },
      code: `name: N3mak
version: 0.0.1
schema: v1

models:
  - name: N3mak gpt-oss-20b
    provider: openai
    model: ${MODEL}
    apiBase: ${base}
    apiKey: ${KEY}
`,
      caveat: {
        en: 'Keep apiBase on the /v1 base. N3mak serves chat completions. If a client tries the Responses API, set useResponsesApi: false. The model must be on your plan.',
        ar: 'اترك apiBase على قاعدة /v1. N3mak يقدّم إكمال المحادثة. إن حاول العميل واجهة Responses فضع useResponsesApi: false. النموذج يجب أن يكون ضمن خطتك.',
      },
    },
    {
      id: 'cline',
      name: 'Cline',
      docHref: 'https://docs.cline.bot/provider-config/openai-compatible',
      steps: {
        en: [
          [text('Open Cline settings.')],
          [text('API Provider: OpenAI Compatible.')],
          [text('Base URL: '), code(base)],
          [text('API Key: '), code(KEY)],
          [text('Model ID: '), code(MODEL)],
          [text('Verify if the button is there, then run a short task.')],
        ],
        ar: [
          [text('افتح إعدادات Cline.')],
          [text('المزوّد: OpenAI Compatible.')],
          [text('Base URL: '), code(base)],
          [text('API Key: '), code(KEY)],
          [text('Model: '), code(MODEL)],
          [text('تحقق ثم جرّب مهمة قصيرة.')],
        ],
      },
      caveat: {
        en: 'The usual failure is a Base URL that is not this /v1 address. The model id has to be allowed on your plan.',
        ar: 'الخطأ الشائع هو عنوان قاعدة ليس عنوان /v1 هذا. معرّف النموذج يجب أن يكون مسموحاً في خطتك.',
      },
    },
    {
      id: 'typingmind',
      name: 'TypingMind',
      docHref: 'https://docs.typingmind.com/manage-and-connect-ai-models/openai',
      steps: {
        en: [
          [text('Models → Add Custom Model.')],
          [text('Name: N3mak gpt-oss-20b. API type: OpenAI Chat Completions, when that choice is shown.')],
          [text('Endpoint URL (the full chat path): '), code(chatUrl)],
          [text('Model ID: '), code(MODEL)],
          [text('Authentication: HTTP header Authorization with value '), code(`Bearer ${KEY}`), text('.')],
          [text('Test, save, then chat.')],
        ],
        ar: [
          [text('Models → Add Custom Model.')],
          [text('الاسم: N3mak gpt-oss-20b.')],
          [text('المسار الكامل: '), code(chatUrl)],
          [text('Model ID: '), code(MODEL)],
          [text('الترويسة Authorization قيمتها '), code(`Bearer ${KEY}`), text('.')],
          [text('اختبر ثم احفظ.')],
        ],
      },
      caveat: {
        en: 'TypingMind’s custom-model form wants the full /v1/chat/completions URL. Cursor, Continue, Cline, LibreChat, and Open WebUI want the /v1 base only.',
        ar: 'نموذج TypingMind المخصص يريد مسار /v1/chat/completions كاملاً. Cursor و Continue و Cline و LibreChat و Open WebUI تريد قاعدة /v1 فقط.',
      },
    },
    {
      id: 'librechat',
      name: 'LibreChat',
      docHref: 'https://www.librechat.ai/docs/quick_start/custom_endpoints',
      steps: {
        en: [
          [text('Put this endpoints.custom block in librechat.yaml. With Docker, mount the file and restart: docker compose down && docker compose up -d.')],
          [text('apiKey is user_provided, so each person pastes '), code(KEY), text(' in the LibreChat prompt. For one shared server key, use apiKey: \'${N3MAK_KEY}\' and set N3MAK_KEY in .env. Do not commit that value.')],
        ],
        ar: [
          [text('ضع كتلة endpoints.custom هذه في librechat.yaml. على Docker اربط الملف ثم أعد التشغيل.')],
          [text('apiKey هو user_provided، فيُدخل كل مستخدم '), code(KEY), text(' من الواجهة. لمفتاح خادم مشترك استخدم apiKey: \'${N3MAK_KEY}\' واضبط N3MAK_KEY في .env. لا تحفظ القيمة في git.')],
        ],
      },
      code: `version: 1.3.18
cache: true
endpoints:
  custom:
    - name: 'N3mak'
      apiKey: 'user_provided'
      baseURL: '${base}'
      models:
        default:
          - '${MODEL}'
          - 'llama-3.1-8b'
        fetch: true
      titleConvo: true
      titleModel: '${MODEL}'
      modelDisplayLabel: 'N3mak'
`,
      caveat: {
        en: 'LibreChat appends /chat/completions to baseURL. Keep baseURL on /v1. Do not set provider to anthropic. A missing name, baseURL, apiKey, or models.default drops the endpoint with no error.',
        ar: 'LibreChat يلحق /chat/completions بـ baseURL. اترك baseURL على /v1. لا تضع provider: anthropic. نقص name أو baseURL أو apiKey أو models.default يُسقط النقطة بلا رسالة.',
      },
    },
    {
      id: 'openwebui',
      name: 'Open WebUI',
      docHref: 'https://docs.openwebui.com/getting-started/quick-start/connect-a-provider/starting-with-openai-compatible.md',
      steps: {
        en: [
          [text('Settings → Admin → Connections → Add Connection under Manage OpenAI API Connections.')],
          [text('URL: '), code(base)],
          [text('API Key: '), code(KEY), text('. Leave Provider on Default.')],
          [text('Verify Connection calls GET /v1/models. If verify fails but chat works, add the model id '), code(MODEL), text(' by hand, plus any other id your plan allows.')],
          [text('Save, then pick the model in chat.')],
        ],
        ar: [
          [text('Settings → Admin → Connections → Add Connection.')],
          [text('URL: '), code(base)],
          [text('API Key: '), code(KEY), text('. اترك Provider على Default.')],
          [text('التحقق يستدعي GET /v1/models. إن فشل التحقق وعمل الدردشة، أضف '), code(MODEL), text(' يدوياً وأي معرّف آخر تسمح به خطتك.')],
          [text('احفظ ثم ابدأ الدردشة.')],
        ],
      },
      code: `OPENAI_API_BASE_URL=${base}
OPENAI_API_KEY=${KEY}
`,
      caveat: {
        en: 'Chat needs POST /v1/chat/completions. Use the /v1 base with no extra trailing path. Embeddings, speech, and image routes are not part of this setup.',
        ar: 'الدردشة تحتاج POST /v1/chat/completions. استخدم قاعدة /v1 بلا مسار إضافي. التضمين والصوت والصور ليست جزءاً من هذا الإعداد.',
      },
    },
  ];
}
