import DocsClient from './DocsClient';

const DEFAULT_BASE_URL = 'https://n3mak-gateway.n3mak.workers.dev/v1';
// deploy-trigger: ensure Ignored Build Step sees a web/ change

export const metadata = {
  title: 'N3mak API docs — توثيق الواجهة',
  description:
    'OpenAI-compatible N3mak gateway. After purchase, @N3mak_bot sends your n3k_ key on Telegram. It can take up to a few hours. Default model: gpt-oss-20b.',
};

function resolveBaseUrl() {
  const gateway = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL?.trim();
  return (gateway || DEFAULT_BASE_URL).replace(/\/$/, '');
}

export default function DocsPage() {
  return <DocsClient baseUrl={resolveBaseUrl()} />;
}
