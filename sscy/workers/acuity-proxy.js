/**
 * Cloudflare Worker: Acuity Scheduling API Proxy
 * Keeps the User ID + API Key server-side. Exposes a whitelisted set of
 * read-only Acuity endpoints with HTTP Basic auth injected.
 *
 * Deploy: Cloudflare Dashboard > Workers & Pages > Create > paste this code
 * Add secrets (Settings > Variables & Secrets):
 *   ACUITY_USER_ID  = your numeric Acuity user ID
 *   ACUITY_API_KEY  = your Acuity API key
 * Route: saltspringcentre.com/api/acuity/* (or use <name>.workers.dev for now)
 *
 * Usage from site JS:
 *   fetch('/api/acuity/appointment-types').then(r => r.json())
 *   fetch('/api/acuity/categories').then(r => r.json())
 *   fetch('/api/acuity/calendars').then(r => r.json())
 */

const ACUITY_BASE = 'https://acuityscheduling.com/api/v1';

// Only these paths can be proxied. No bookings, no client data, no payments.
const ALLOWED_ENDPOINTS = new Set([
  'appointment-types',
  'categories',
  'calendars'
]);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    // Last path segment = endpoint (strips any /api/acuity/ prefix).
    const parts = url.pathname.split('/').filter(Boolean);
    const endpoint = parts[parts.length - 1];

    if (!ALLOWED_ENDPOINTS.has(endpoint)) {
      return new Response(JSON.stringify({ error: 'Endpoint not allowed' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    if (!env.ACUITY_USER_ID || !env.ACUITY_API_KEY) {
      const body = JSON.stringify({ error: 'Missing credentials' });
      return new Response(body, {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(request)
        }
      });
    }

    const upstream = `${ACUITY_BASE}/${endpoint}`;
    const creds = `${env.ACUITY_USER_ID}:${env.ACUITY_API_KEY}`;
    const authHeader = 'Basic ' + btoa(creds);

    const response = await fetch(upstream, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
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
