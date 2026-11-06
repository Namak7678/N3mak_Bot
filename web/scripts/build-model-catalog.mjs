/**
 * Build web/data/omniroute-models.json from the OmniRoute snapshot markdown.
 * Usage: node scripts/build-model-catalog.mjs <path-to-omniroute-models.md>
 *
 * Model ids are copied from the snapshot. This script does not invent ids.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error('Usage: node scripts/build-model-catalog.mjs <omniroute-models.md>');
  process.exit(1);
}

const markdown = fs.readFileSync(sourcePath, 'utf8');
const lines = markdown.split(/\r?\n/);

const KIND_BY_PROVIDER = {
  combo: 'routing',
  aihorde: 'image',
  'veoaifree-web': 'video',
};

const POPULAR = [
  {
    providerId: 'cloudflare-playground',
    models: [
      { id: 'cfp/openai/gpt-oss-20b', role: 'default' },
      { id: 'cfp/openai/gpt-oss-120b', role: 'quality' },
      { id: 'cfp/zai-org/glm-4.7-flash', role: 'fast' },
      { id: 'cfp/moonshotai/kimi-k2.6', role: 'kimi' },
      { id: 'cfp/qwen/qwen2.5-coder-32b-instruct', role: 'code' },
      { id: 'cfp/meta-llama/llama-3.3-70b-instruct-fp8-fast', role: 'chat' },
      { id: 'cfp/deepseek-ai/deepseek-r1-distill-qwen-32b', role: 'reasoning' },
    ],
  },
  {
    providerId: 'combo',
    models: [
      { id: 'auto/best-free', role: 'shortcut' },
      { id: 'auto/cheap', role: 'shortcut' },
      { id: 'auto/chat', role: 'shortcut' },
      { id: 'auto/best-coding', role: 'shortcut' },
      { id: 'auto/best-reasoning', role: 'shortcut' },
      { id: 'auto/best-vision', role: 'shortcut' },
    ],
  },
  {
    providerId: 'opencode',
    models: [
      { id: 'oc/deepseek-v4-flash-free', role: 'chat' },
      { id: 'oc/mimo-v2.5-free', role: 'chat' },
      { id: 'oc/nemotron-3-ultra-free', role: 'chat' },
    ],
  },
  {
    providerId: 'duckduckgo-web',
    models: [
      { id: 'ddgw/gpt-5.4-mini', role: 'chat' },
      { id: 'ddgw/claude-haiku-4-5', role: 'chat' },
    ],
  },
];

function plain(text) {
  return text.replace(/\*\*/g, '').replace(/`/g, '').trim();
}

const providers = [];
let current = null;

for (const line of lines) {
  const heading = line.match(/^### `([^`]+)` \((\d+) models\) — alias `([^`]+)`/);
  if (heading) {
    current = {
      id: heading[1],
      alias: heading[3],
      declaredCount: Number(heading[2]),
      kind: KIND_BY_PROVIDER[heading[1]] || 'chat',
      note: '',
      models: [],
    };
    providers.push(current);
    continue;
  }

  if (!current) continue;

  if (line.startsWith('## ')) {
    current = null;
    continue;
  }

  const bullet = line.match(/^- `([^`]+)`\s*$/);
  if (bullet) {
    current.models.push(bullet[1]);
    continue;
  }

  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('|') || trimmed.startsWith('- ')) continue;
  const sentence = plain(trimmed);
  current.note = current.note ? `${current.note} ${sentence}` : sentence;
}

const errors = [];
const seen = new Map();

for (const provider of providers) {
  if (provider.models.length !== provider.declaredCount) {
    errors.push(
      `${provider.id}: parsed ${provider.models.length}, heading says ${provider.declaredCount}`,
    );
  }
  for (const id of provider.models) {
    if (seen.has(id)) errors.push(`duplicate id ${id} in ${provider.id} and ${seen.get(id)}`);
    seen.set(id, provider.id);
  }
}

const total = providers.reduce((sum, provider) => sum + provider.models.length, 0);
if (total !== 495) errors.push(`expected 495 model ids, parsed ${total}`);

const known = new Set(seen.keys());
for (const group of POPULAR) {
  if (!providers.some((provider) => provider.id === group.providerId)) {
    errors.push(`popular group provider missing: ${group.providerId}`);
  }
  for (const model of group.models) {
    if (!known.has(model.id)) errors.push(`popular model not in snapshot: ${model.id}`);
    if (seen.get(model.id) !== group.providerId) {
      errors.push(`${model.id} belongs to ${seen.get(model.id)}, not ${group.providerId}`);
    }
  }
}

if (!known.has('cfp/openai/gpt-oss-20b')) {
  errors.push('default model cfp/openai/gpt-oss-20b missing from snapshot');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const catalog = {
  source: 'OmniRoute GET /v1/models snapshot captured 2026-11-06 11:51 MSK',
  capturedAt: '2026-11-06T08:51:00.000Z',
  total,
  defaultModel: 'cfp/openai/gpt-oss-20b',
  providers: providers.map(({ declaredCount, ...provider }) => provider),
  popular: POPULAR,
};

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'omniroute-models.json');
fs.writeFileSync(outFile, `${JSON.stringify(catalog, null, 2)}\n`);

console.log(`Wrote ${outFile}`);
console.log(
  providers
    .map((provider) => `${provider.id} (${provider.kind}) ${provider.models.length} alias=${provider.alias}`)
    .join('\n'),
);
console.log(`total ${total}`);
