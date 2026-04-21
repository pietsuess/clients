/**
 * Cloudflare Worker: Retreat Guru API Proxy
 * Keeps the API token server-side. Read-only passthrough for the
 * public programs endpoints.
 *
 * Add secret (Settings > Variables & Secrets):
 *   RETREAT_GURU_TOKEN = the saltspringcentre retreat.guru API token
 *
 * Supports:
 *   GET /programs           -> list, with ?min_date=...&limit=...&include=...
 *   GET /programs/<id>      -> single program detail, with ?include=...
 */

const UPSTREAM_BASE =
  'https://saltspringcentre.secure.retreat.guru/api/v1';

const ALLOWED_PARAMS = ['public', 'min_date', 'limit', 'include'];

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (!env.RETREAT_GURU_TOKEN) {
      const body = JSON.stringify({ error: 'Missing token' });
      return new Response(body, {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(request)
        }
      });
    }

    const incoming = new URL(request.url);
    const parts = incoming.pathname.split('/').filter(Boolean);

    // Find where 'programs' lives in the path so any route prefix
    // (e.g. /api/retreat-guru/programs/<id>) is ignored.
    const i = parts.indexOf('programs');
    if (i === -1) {
      const body = JSON.stringify({ error: 'Endpoint not allowed' });
      return new Response(body, {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(request)
        }
      });
    }

    const tail = parts.slice(i).join('/');
    const upstream = new URL(UPSTREAM_BASE + '/' + tail);
    upstream.searchParams.set('token', env.RETREAT_GURU_TOKEN);

    for (const key of ALLOWED_PARAMS) {
      const val = incoming.searchParams.get(key);
      if (val !== null) upstream.searchParams.set(key, val);
    }
    // Force public=1 so registrations/transactions stay hidden.
    upstream.searchParams.set('public', '1');

    const response = await fetch(upstream.toString(), {
      headers: { 'Accept': 'application/json' }
    });
    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        ...corsHeaders(request)
      }
    });
  }
};

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}
