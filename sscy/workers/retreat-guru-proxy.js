/**
 * Cloudflare Worker: Retreat Guru API Proxy
 * Keeps the API token server-side. Only exposes /api/v1/programs (read-only, public).
 *
 * Deploy: Cloudflare Dashboard > Workers & Pages > Create > paste this code
 * Add environment variable: RETREAT_GURU_TOKEN = ce54314d68b0417fc9be95a93d202c81
 * Set up route: saltspringcentre.com/api/retreat-guru/* or use worker subdomain
 */

const UPSTREAM = 'https://saltspringcentre.secure.retreat.guru/api/v1/programs';

// Only these query params are forwarded (no token leak, no endpoint abuse)
const ALLOWED_PARAMS = ['public', 'min_date', 'limit', 'include'];

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(request)
      });
    }

    // Only GET
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Build upstream URL with only allowed params + injected token
    const incoming = new URL(request.url);
    const upstream = new URL(UPSTREAM);
    upstream.searchParams.set('token', env.RETREAT_GURU_TOKEN);

    for (const key of ALLOWED_PARAMS) {
      const val = incoming.searchParams.get(key);
      if (val !== null) upstream.searchParams.set(key, val);
    }

    // Always force public=1 so registrations/transactions stay hidden
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
