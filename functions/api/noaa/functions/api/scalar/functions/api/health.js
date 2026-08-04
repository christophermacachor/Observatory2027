// functions/api/health.js
// Handles: https://macachor.org/api/health

export async function onRequest(context) {
  const { request, env, params } = context;
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  return new Response(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'scalar-plasma-api',
    version: 'v5.1',
    endpoints: [
      '/api/noaa/all',
      '/api/scalar/latest',
      '/api/health'
    ]
  }), {
    status: 200,
    headers
  });
}
