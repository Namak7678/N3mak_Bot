'use client';

import { useMemo, useState } from 'react';
import { AUTH_HEADER, DEFAULT_MODEL, ERRORS, PLANS, copy } from './copy';
import { toolGuides } from './tools';

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function examplesFor(baseUrl) {
  const root = baseUrl.replace(/\/$/, '');
  const chatBody = {
    model: DEFAULT_MODEL,
    messages: [{ role: 'user', content: 'ping' }],
  };
  const streamBody = {
    model: DEFAULT_MODEL,
    messages: [{ role: 'user', content: 'hi' }],
    stream: true,
  };
  return [
    {
      key: 'exampleChat',
      code: `curl ${JSON.stringify(`${root}/chat/completions`)} \\
  -H ${JSON.stringify(AUTH_HEADER)} \\
  -H "Content-Type: application/json" \\
  -d ${shellQuote(JSON.stringify(chatBody))}`,
    },
    {
      key: 'exampleStream',
      code: `curl -N ${JSON.stringify(`${root}/chat/completions`)} \\
  -H ${JSON.stringify(AUTH_HEADER)} \\
  -H "Content-Type: application/json" \\
  -d ${shellQuote(JSON.stringify(streamBody))}`,
    },
    {
      key: 'examplePython',
      code: `# pip install openai
from openai import OpenAI

client = OpenAI(
    base_url=${JSON.stringify(root)},
    api_key="n3k_...",
)

completion = client.chat.completions.create(
    model=${JSON.stringify(DEFAULT_MODEL)},
    messages=[{"role": "user", "content": "ping"}],
)
print(completion.choices[0].message.content)`,
    },
    {
      key: 'exampleModels',
      code: `curl -sS ${JSON.stringify(`${root}/models`)} \\
  -H ${JSON.stringify(AUTH_HEADER)}`,
    },
  ];
}

function CopyButton({ text, label, copiedLabel }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      } catch {
        // Still confirm the click if the clipboard is blocked.
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button type="button" className="docs-copy" onClick={onCopy}>
      {copied ? copiedLabel : label}
    </button>
  );
}

function ModelIds({ ids }) {
  return (
    <ul className="docs-model-list">
      {ids.map((id) => (
        <li key={id}><code className="docs-id" dir="ltr">{id}</code></li>
      ))}
    </ul>
  );
}

export default function DocsClient({ baseUrl }) {
  const [lang, setLang] = useState('ar');
  const t = copy[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const examples = useMemo(() => examplesFor(baseUrl), [baseUrl]);
  const tools = useMemo(() => toolGuides(baseUrl), [baseUrl]);

  return (
    <div className="docs" dir={dir} lang={lang}>
      <div className="wrap">
        <header className="docs-top">
          <div>
            <span className="eyebrow">{t.eyebrow}</span>
            <h1>{t.title}</h1>
            <p className="docs-lead">
              {t.introBefore}{' '}
              <a href="https://t.me/N3mak_bot" target="_blank" rel="noreferrer" dir="ltr">@N3mak_bot</a>
              {t.introAfter}
            </p>
            <p className="docs-lead docs-lead-next">
              {t.introMoreBefore}{' '}
              <code className="docs-inline" dir="ltr">GET /v1/models</code>{' '}
              {t.introMoreAfter}
            </p>
          </div>
          <div className="docs-lang" role="group" aria-label={t.language}>
            <button type="button" aria-pressed={lang === 'ar'} onClick={() => setLang('ar')}>
              العربية
            </button>
            <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
              English
            </button>
          </div>
        </header>

        <nav className="docs-jump" aria-label={t.title}>
          {t.jump.map((item) => (
            <a key={item.href} href={item.href}>{item.label}</a>
          ))}
        </nav>

        <section id="start" className="docs-quick">
          <article className="data-card">
            <h2>{t.baseTitle}</h2>
            <p>{t.baseBody}</p>
            <div className="docs-kv">
              <code dir="ltr">{baseUrl}</code>
              <CopyButton text={baseUrl} label={t.copy} copiedLabel={t.copied} />
            </div>
            <p className="docs-sub docs-card-note">{t.baseNote}</p>
          </article>
          <article className="data-card">
            <h2>{t.authTitle}</h2>
            <p>{t.authBody}</p>
            <div className="docs-kv">
              <code dir="ltr">{AUTH_HEADER}</code>
              <CopyButton text={AUTH_HEADER} label={t.copy} copiedLabel={t.copied} />
            </div>
          </article>
          <article className="data-card">
            <h2>{t.modelTitle}</h2>
            <p>{t.modelBody}</p>
            <div className="docs-kv">
              <code dir="ltr">{DEFAULT_MODEL}</code>
              <CopyButton text={DEFAULT_MODEL} label={t.copy} copiedLabel={t.copied} />
            </div>
          </article>
        </section>

        <section id="models">
          <h2>{t.modelsTitle}</h2>
          <p className="docs-sub">{t.modelsBody}</p>
          <div className="docs-table-wrap data-card">
            <table className="docs-table">
              <thead>
                <tr>
                  <th>{t.colPlan}</th>
                  <th>{t.colModels}</th>
                </tr>
              </thead>
              <tbody>
                {PLANS.map((plan) => (
                  <tr key={plan.id}>
                    <td>{t.plans[plan.id]}{plan.price ? ` ${plan.price}` : ` · ${t.free}`}</td>
                    <td><ModelIds ids={plan.models} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="docs-note">
            {t.trialHowBefore}{' '}
            <a href="https://t.me/N3mak_bot" target="_blank" rel="noreferrer" dir="ltr">@N3mak_bot</a>{' '}
            {t.trialHowMid}{' '}
            <code className="docs-inline" dir="ltr">/trial</code>
            {t.trialHowAfter}
          </p>
        </section>

        <section id="limits">
          <h2>{t.limitsTitle}</h2>
          <p className="docs-sub">{t.limitsBody}</p>
          <div className="docs-table-wrap data-card">
            <table className="docs-table">
              <thead>
                <tr>
                  <th>{t.colPlan}</th>
                  <th>{t.colDay}</th>
                  <th>{t.colMinute}</th>
                  <th>{t.colTokens}</th>
                </tr>
              </thead>
              <tbody>
                {PLANS.map((plan) => (
                  <tr key={plan.id}>
                    <td>{t.plans[plan.id]}{plan.price ? ` ${plan.price}` : ` · ${t.free}`}</td>
                    <td>{plan.rpd.toLocaleString('en-US')}</td>
                    <td>{plan.rpm}</td>
                    <td>{plan.maxTokens.toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="examples">
          <h2>{t.examplesTitle}</h2>
          <p className="docs-sub">{t.examplesBody}</p>
          <p className="docs-note">{t.streamNote}</p>
          {examples.map((example) => (
            <article key={example.key} className="docs-example data-card">
              <div className="docs-example-head">
                <h3>{t[example.key]}</h3>
                <CopyButton text={example.code} label={t.copy} copiedLabel={t.copied} />
              </div>
              <pre className="docs-code"><code>{example.code}</code></pre>
            </article>
          ))}
        </section>

        <section id="tools">
          <h2>{t.toolsTitle}</h2>
          <p className="docs-sub">
            {t.toolsLeadBefore}{' '}
            <code className="docs-inline" dir="ltr">{DEFAULT_MODEL}</code>{' '}
            {t.toolsLeadAfter}
          </p>
          {tools.map((tool) => (
            <details key={tool.id} className="data-card docs-tool">
              <summary>{tool.name}</summary>
              <ol>
                {tool.steps[lang].map((parts, stepIndex) => (
                  <li key={`${tool.id}-${stepIndex}`}>
                    {parts.map((part, partIndex) => (
                      part.code
                        ? <code key={partIndex} className="docs-inline" dir="ltr">{part.code}</code>
                        : <span key={partIndex}>{part.text}</span>
                    ))}
                  </li>
                ))}
              </ol>
              {tool.code ? (
                <div className="docs-example">
                  <div className="docs-example-head">
                    <h3>{tool.name}</h3>
                    <CopyButton text={tool.code} label={t.copy} copiedLabel={t.copied} />
                  </div>
                  <pre className="docs-code"><code>{tool.code}</code></pre>
                </div>
              ) : null}
              <p className="docs-note"><strong>{t.toolCaveat}.</strong> {tool.caveat[lang]}</p>
              <p className="docs-tool-doc">
                <a href={tool.docHref} target="_blank" rel="noreferrer">{t.toolDocs}</a>
              </p>
            </details>
          ))}
        </section>

        <section id="endpoints">
          <h2>{t.endpointsTitle}</h2>
          <p className="docs-sub">{t.endpointsBody}</p>
          <div className="docs-table-wrap data-card">
            <table className="docs-table">
              <thead>
                <tr>
                  <th>{t.colMethod}</th>
                  <th>{t.colPath}</th>
                  <th>{t.colNotes}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>GET</td>
                  <td><code className="docs-id" dir="ltr">/v1/models</code></td>
                  <td>{t.epModels}</td>
                </tr>
                <tr>
                  <td>POST</td>
                  <td><code className="docs-id" dir="ltr">/v1/chat/completions</code></td>
                  <td>{t.epChat}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="errors">
          <h2>{t.errorsTitle}</h2>
          <p className="docs-sub">{t.errorsBody}</p>
          <div className="docs-table-wrap data-card">
            <table className="docs-table">
              <thead>
                <tr>
                  <th>{t.colStatus}</th>
                  <th>{t.colWhen}</th>
                </tr>
              </thead>
              <tbody>
                {ERRORS.map((row) => (
                  <tr key={row.status}>
                    <td>{row.status}</td>
                    <td>{t[row.key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="docs-note">{t.e400}</p>
        </section>
      </div>
    </div>
  );
}
