'use client';

import { useEffect, useRef, useState } from 'react';
import { BUY_URL, MAX_PROMPT, copy } from './copy';

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

function readRemaining(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function safeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default function PlaygroundClient({ baseUrl }) {
  const [lang, setLang] = useState('ar');
  const [prompt, setPrompt] = useState('');
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState(null);
  const [full, setFull] = useState('');
  const [shown, setShown] = useState('');
  const [model, setModel] = useState('');
  const [remaining, setRemaining] = useState(null);
  const [upgradeUrl, setUpgradeUrl] = useState(null);
  const requestId = useRef(0);
  const t = copy[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const busy = phase === 'thinking' || phase === 'typing';

  useEffect(() => {
    if (phase !== 'typing') return undefined;
    let index = 0;
    const step = full.length > 240 ? 3 : 1;
    const timer = window.setInterval(() => {
      index = Math.min(full.length, index + step);
      setShown(full.slice(0, index));
      if (index >= full.length) {
        window.clearInterval(timer);
        setPhase('done');
      }
    }, 18);
    return () => window.clearInterval(timer);
  }, [phase, full]);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy) return;
    if (!prompt.trim() || prompt.length > MAX_PROMPT) {
      setPhase('error');
      setError('bad');
      setShown('');
      setFull('');
      return;
    }

    const id = requestId.current + 1;
    requestId.current = id;
    setPhase('thinking');
    setError(null);
    setShown('');
    setFull('');
    setModel('');
    setRemaining(null);
    setUpgradeUrl(null);

    let response;
    try {
      response = await fetch(`${baseUrl}/demo/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ prompt }),
      });
    } catch {
      if (requestId.current !== id) return;
      setPhase('error');
      setError('network');
      return;
    }

    if (requestId.current !== id) return;

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (response.status === 400) {
      setPhase('error');
      setError('bad');
      return;
    }
    if (response.status === 403) {
      setPhase('error');
      setError('origin');
      return;
    }
    if (response.status === 429) {
      setPhase('error');
      setError('limit');
      setUpgradeUrl(safeHttpUrl(data && data.upgrade_url));
      setRemaining(readRemaining(data && data.remaining));
      return;
    }
    if (!response.ok || !data || typeof data.reply !== 'string') {
      setPhase('error');
      setError('down');
      return;
    }

    setFull(data.reply);
    setShown('');
    setModel(typeof data.model === 'string' && data.model ? data.model : 'gpt-oss-20b');
    setRemaining(readRemaining(data.remaining));
    setPhase('typing');
  }

  const showReply = phase === 'typing' || phase === 'done';
  const showCta = showReply || error !== null;
  const ctaHref = error === 'limit' && upgradeUrl ? upgradeUrl : BUY_URL;
  const errorText = error === 'bad'
    ? t.e400
    : error === 'limit'
      ? t.e429
      : error === 'origin'
        ? t.e403
        : error === 'network'
          ? t.network
          : t.unavailable;

  return (
    <div className="play" dir={dir} lang={lang}>
      <div className="wrap play-wrap">
        <header className="docs-top">
          <div>
            <span className="eyebrow">{t.eyebrow}</span>
            <h1>{t.titleBefore} <span dir="ltr">gpt-oss-20b</span></h1>
            <p className="docs-lead">
              {t.leadBefore}{' '}
              <code className="docs-inline" dir="ltr">gpt-oss-20b</code>.
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

        <form className="data-card play-form" onSubmit={onSubmit}>
          <label htmlFor="play-prompt">{t.promptLabel}</label>
          <textarea
            id="play-prompt"
            value={prompt}
            maxLength={MAX_PROMPT}
            placeholder={t.placeholder}
            onChange={(event) => setPrompt(event.target.value.slice(0, MAX_PROMPT))}
          />
          <div className="play-row">
            <p className={prompt.length >= MAX_PROMPT ? 'play-count play-count-full' : 'play-count'}>
              {fill(t.counter, { n: prompt.length })}
            </p>
            <button type="submit" className="play-send" disabled={busy || prompt.trim().length === 0}>
              {phase === 'thinking' ? t.thinking : t.send}
            </button>
          </div>
        </form>

        <section className="play-result" aria-live="polite">
          {phase === 'thinking' ? <p className="play-thinking">{t.thinking}</p> : null}
          {error ? <p className="play-error" role="alert">{errorText}</p> : null}
          {showReply ? (
            <article className="data-card">
              <h2>{t.replyLabel}</h2>
              {model ? (
                <p className="play-model">
                  {t.modelLine}: <span dir="ltr">{model}</span>
                </p>
              ) : null}
              <p className={phase === 'typing' ? 'play-reply typing' : 'play-reply'}>{shown}</p>
            </article>
          ) : null}
          {remaining !== null && (showReply || error === 'limit') ? (
            <p className="play-remaining">{fill(t.remaining, { n: remaining })}</p>
          ) : null}
          {showCta ? (
            <div className="play-actions">
              <a className="play-cta" href={ctaHref}>{t.cta}</a>
              <a className="play-docs" href="/docs">{t.docs}</a>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
