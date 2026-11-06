import PlaygroundClient from './PlaygroundClient';

const DEFAULT_BASE_URL = 'https://n3mak-gateway.n3mak.workers.dev/v1';

export const metadata = {
  title: 'Try gpt-oss-20b — N3mak',
  description: 'Send a short prompt to gpt-oss-20b. No API key. Get your own key for $3.',
};

function resolveBaseUrl() {
  const gateway = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL?.trim();
  return (gateway || DEFAULT_BASE_URL).replace(/\/$/, '');
}

export default function PlaygroundPage() {
  return <PlaygroundClient baseUrl={resolveBaseUrl()} />;
}
