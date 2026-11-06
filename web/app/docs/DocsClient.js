'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import catalog from '../../data/omniroute-models.json';
import { ENDPOINTS, copy } from './copy';

const AUTH_HEADER = 'Authorization: Bearer YOUR_API_KEY';

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function examplesFor(baseUrl, model) {
  const root = baseUrl.replace(/\/$/, '');
  const chatBody = {
    model,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 64,
  };
  const streamBody = {
    model,
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
    api_key="YOUR_API_KEY",
)

completion = client.chat.completions.create(
    model=${JSON.stringify(model)},
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

function CopyButton({ text, label, copiedLabel, compact = false }) {
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
        // Keep the copied state so the button still confirms the click.
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button type="button" className={compact ? 'docs-copy docs-copy-compact' : 'docs-copy'} onClick={onCopy}>
      {copied ? copiedLabel : label}
    </button>
  );
}

function ProviderGroup({ provider, query, t }) {
  const detailsRef = useRef(null);
  const expanded = Boolean(query.trim()) || provider.id === 'cloudflare-playground';

  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = expanded;
  }, [expanded, query, provider.id]);

  return (
    <details ref={detailsRef} className="data-card docs-provider">
      <summary>
        <span>{provider.label}</span>
        <span className="docs-meta">
          {t.alias}: {provider.alias} · {provider.kindLabel} · {provider.models.length}
        </span>
      </summary>
      {t.providerNotes[provider.id] ? <p className="docs-sub">{t.providerNotes[provider.id]}</p> : null}
      <ul className="docs-models">
        {provider.models.map((id) => (
          <li key={id}>
            <span className="docs-id">{id}</span>
            <CopyButton text={id} label={t.copyModel} copiedLabel={t.copied} compact />
          </li>
        ))}
      </ul>
    </details>
  );
}

function providerMatch(provider, label, kindLabel, query) {
  return [provider.id, provider.alias, label, kindLabel].join(' ').toLowerCase().includes(query);
}

export default function DocsClient({ baseUrl, isPlaceholder }) {
  const [lang, setLang] = useState('ar');
  const [query, setQuery] = useState('');
  const t = copy[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const model = catalog.defaultModel;
  const examples = useMemo(() => examplesFor(baseUrl, model), [baseUrl, model]);
  const providersById = useMemo(
    () => Object.fromEntries(catalog.providers.map((provider) => [provider.id, provider])),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.providers
      .map((provider) => {
        const label = t.providers[provider.id] || provider.id;
        const kindLabel = t.kinds[provider.kind] || provider.kind;
        const idHits = q ? provider.models.filter((id) => id.toLowerCase().includes(q)) : provider.models;
        const showAll = q && idHits.length === 0 && providerMatch(provider, label, kindLabel, q);
        const models = !q || showAll ? provider.models : idHits;
        return { ...provider, label, kindLabel, models };
      })
      .filter((provider) => provider.models.length > 0);
  }, [query, t]);

  const shown = filtered.reduce((sum, provider) => sum + provider.models.length, 0);

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

        {isPlaceholder ? (
          <div className="docs-placeholder">
            <p><strong>{t.placeholderBadge}.</strong> {t.placeholderBody}</p>
            <code dir="ltr">{baseUrl}</code>
          </div>
        ) : null}

        <section id="start" className="docs-quick">
          <article className="data-card">
            <h2>{t.baseTitle}</h2>
            <p>{t.baseBody}</p>
            <div className="docs-kv">
              <code dir="ltr">{baseUrl}</code>
              <CopyButton text={baseUrl} label={t.copy} copiedLabel={t.copied} />
            </div>
            {isPlaceholder ? <span className="status-badge status-soon">{t.placeholderBadge}</span> : null}
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
            <h2>{t.defaultTitle}</h2>
            <p>{t.defaultBody}</p>
            <div className="docs-kv">
              <code dir="ltr">{model}</code>
              <CopyButton text={model} label={t.copy} copiedLabel={t.copied} />
            </div>
          </article>
        </section>

        <section id="examples">
          <h2>{t.examplesTitle}</h2>
          <p className="docs-sub">{t.examplesBody}</p>
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

        <section id="models">
          <h2>{t.modelsTitle}</h2>
          <p className="docs-sub">{t.modelsBody}</p>
          <div className="docs-table-wrap data-card">
            <table className="docs-table">
              <thead>
                <tr>
                  <th>{t.colModel}</th>
                  <th>{t.colRole}</th>
                  <th>{t.colProvider}</th>
                </tr>
              </thead>
              {catalog.popular.map((group) => {
                const provider = providersById[group.providerId];
                const label = t.providers[group.providerId] || group.providerId;
                return (
                  <tbody key={group.providerId}>
                    <tr className="docs-group">
                      <th colSpan={3}>{label} · {provider.alias}</th>
                    </tr>
                    {group.models.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="docs-id-row">
                            <span className="docs-id">{item.id}</span>
                            <CopyButton text={item.id} label={t.copy} copiedLabel={t.copied} compact />
                          </div>
                        </td>
                        <td>{t.roles[item.role]}</td>
                        <td>{provider.id}</td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>
        </section>

        <section id="catalog">
          <h2>{t.catalogTitle}</h2>
          <p className="docs-sub">{t.catalogBody}</p>
          <label className="docs-search-label" htmlFor="model-search">{t.searchLabel}</label>
          <input
            id="model-search"
            className="docs-search"
            dir="auto"
            type="search"
            value={query}
            placeholder={t.searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="docs-count">{fill(t.matchCount, { shown, total: catalog.total })}</p>
          {filtered.length === 0 ? <p className="data-card docs-sub">{t.noMatches}</p> : null}
          {filtered.map((provider) => (
            <ProviderGroup key={provider.id} provider={provider} query={query} t={t} />
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
                {ENDPOINTS.map((endpoint) => (
                  <tr key={`${endpoint.method} ${endpoint.path}`}>
                    <td>{endpoint.method}</td>
                    <td><span className="docs-id">{endpoint.path}</span></td>
                    <td>{t.endpointNotes[endpoint.note]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="docs-note">{fill(t.availability, { total: catalog.total })}</p>
      </div>
    </div>
  );
}
