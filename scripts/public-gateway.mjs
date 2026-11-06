#!/usr/bin/env node
/**
 * Public edge for Cloudflare Tunnel:
 *  - /v1/*  -> OmniRoute :20128 (API only; dashboard blocked)
 *  - /webhooks/whop -> bot :3010
 *  - everything else -> 404
 */
import http from 'http';
import { request as httpRequest } from 'http';

const LISTEN = Number(process.env.PUBLIC_GATEWAY_PORT || 20130);
const OMNI = process.env.OMNI_ORIGIN || 'http://127.0.0.1:20128';
const BOT = process.env.BOT_ORIGIN || 'http://127.0.0.1:3010';

function proxy(req, res, targetBase) {
  const u = new URL(req.url, 'http://localhost');
  const dest = new URL(u.pathname + u.search, targetBase);
  const headers = { ...req.headers, host: dest.host };
  const opts = {
    protocol: dest.protocol,
    hostname: dest.hostname,
    port: dest.port || (dest.protocol === 'https:' ? 443 : 80),
    path: dest.pathname + dest.search,
    method: req.method,
    headers,
  };
  const preq = httpRequest(opts, (pres) => {
    res.writeHead(pres.statusCode || 502, pres.headers);
    pres.pipe(res);
  });
  preq.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'bad_gateway', message: err.message }));
  });
  req.pipe(preq);
}

const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path === '/v1' || path.startsWith('/v1/')) {
    return proxy(req, res, OMNI);
  }
  if (path === '/webhooks/whop' || path.startsWith('/webhooks/whop/')) {
    return proxy(req, res, BOT);
  }
  if (path === '/' || path === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: 'n3mak-public-gateway', routes: ['/v1/*', '/webhooks/whop'] }));
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found', hint: 'only /v1 and /webhooks/whop are public' }));
});

server.listen(LISTEN, '127.0.0.1', () => {
  console.log(`[public-gateway] listening on 127.0.0.1:${LISTEN} -> omni ${OMNI}, bot ${BOT}`);
});
