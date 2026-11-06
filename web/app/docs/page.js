import DocsClient from './DocsClient';

const PLACEHOLDER_BASE_URL = 'https://<PUBLIC_OMNIROUTE_HOST>/v1';

export const metadata = {
  title: 'N3mak API docs — توثيق الواجهة',
  description:
    'OpenAI-compatible API for N3mak. After purchase, @N3mak_bot sends your key on Telegram. Default model: cfp/openai/gpt-oss-20b.',
};

function resolveBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_OMNIROUTE_BASE_URL?.trim();
  if (!configured) {
    return { baseUrl: PLACEHOLDER_BASE_URL, isPlaceholder: true };
  }
  return { baseUrl: configured.replace(/\/$/, ''), isPlaceholder: false };
}

export default function DocsPage() {
  const { baseUrl, isPlaceholder } = resolveBaseUrl();
  return <DocsClient baseUrl={baseUrl} isPlaceholder={isPlaceholder} />;
}
