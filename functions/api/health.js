export async function onRequest(context) {
  return new Response(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'observatory-api',
    version: 'v5.1',
    endpoints: [
      '/api/health',
      '/api/noaa/all',
      '/api/noaa/kp',
      '/api/noaa/dst',
      '/api/noaa/mag',
      '/api/noaa/wind',
      '/api/scalar/latest',
      '/api/scalar/coherence',
      '/api/scalar/field',
      '/api/scalar/accuracy'
    ]
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
    }
  });
}
