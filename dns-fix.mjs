// Preload: fix DNS + TLS 1.2 for wrangler deploys on this machine.
//
// Root cause: LibreSSL/3.3.6 on macOS fails with "bad_record_mac" (sslv3 alert)
// on TLS 1.3 connections to api.cloudflare.com when the upload body exceeds ~1.5MB.
// This kills any wrangler deploy of a non-trivial worker bundle.
//
// Fix 1: Force Google DNS — local router returns NXDOMAIN for sparrow.cloudflare.com,
//   causing Node to coalesce the connection with api.cloudflare.com (wrong IP).
// Fix 2: Force TLS 1.2 in undici Agent — avoids the TLS 1.3 renegotiation bug.

import dns from 'node:dns';
import tls from 'node:tls';

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
console.error('[dns-fix] DNS servers set to 8.8.8.8, 8.8.4.4, 1.1.1.1');

// Patch undici global dispatcher: force TLS 1.2 + extended timeouts.
// wrangler uses undici's global fetch for all CF API calls.
try {
  const { Agent, setGlobalDispatcher } = await import('undici');
  setGlobalDispatcher(new Agent({
    connections: 4,
    pipelining: 0,
    headersTimeout: 120_000,
    bodyTimeout: 300_000,
    connect: {
      timeout: 30_000,
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2', // lock to TLS 1.2 — avoids LibreSSL bad_record_mac on 1.3
    },
  }));
  console.error('[dns-fix] undici Agent patched: TLS 1.2 forced, 5min body timeout');
} catch (e) {
  console.error('[dns-fix] undici patch skipped:', e.message);
}
