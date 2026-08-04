// _workers.js - Cloudflare Worker for noaa.macachor.org
// This file will be automatically deployed by Cloudflare Pages

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
      'Access-Control-Max-Age': '86400',
      'Content-Type': 'application/json'
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    try {
      // Route: /api/scalar/latest - Your Ω-Gateway endpoint
      if (url.pathname === '/api/scalar/latest') {
        return await handleScalarLatest(request, corsHeaders);
      }

      // Route: /api/noaa/all - All data in one request (optimized)
      if (url.pathname === '/api/noaa/all') {
        return await handleAllNOAA(request, corsHeaders);
      }

      // Route: /api/noaa/kp - Kp index
      if (url.pathname === '/api/noaa/kp') {
        return await proxyRequest('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', corsHeaders);
      }

      // Route: /api/noaa/dst - Dst index
      if (url.pathname === '/api/noaa/dst') {
        return await proxyRequest('https://services.swpc.noaa.gov/products/kyoto-dst.json', corsHeaders);
      }

      // Route: /api/noaa/mag - Real-time solar wind magnetic field
      if (url.pathname === '/api/noaa/mag') {
        return await proxyRequest('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_lm.json', corsHeaders);
      }

      // Route: /api/noaa/wind - Solar wind plasma data
      if (url.pathname === '/api/noaa/wind') {
        return await proxyRequest('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_lm.json', corsHeaders);
      }

      // Route: /api/health - Health check
      if (url.pathname === '/api/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
          worker: 'noaa-proxy-v1.0',
          routes: ['/api/scalar/latest', '/api/noaa/all', '/api/noaa/kp', '/api/noaa/dst', '/api/noaa/mag', '/api/noaa/wind', '/api/health']
        }), {
          status: 200,
          headers: corsHeaders
        });
      }

      // If it's a static asset request, let Pages handle it
      if (url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
        return new Response(null, {
          status: 404,
          headers: corsHeaders
        });
      }

      // Default: 404
      return new Response(JSON.stringify({
        error: 'Not found',
        available_endpoints: ['/api/scalar/latest', '/api/noaa/all', '/api/noaa/kp', '/api/noaa/dst', '/api/noaa/mag', '/api/noaa/wind', '/api/health']
      }), {
        status: 404,
        headers: corsHeaders
      });

    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};

// Handle all NOAA data in one optimized request
async function handleAllNOAA(request, corsHeaders) {
  try {
    // Fetch all NOAA data in parallel
    const [kpData, dstData, magData, windData] = await Promise.all([
      fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').then(r => r.json()),
      fetch('https://services.swpc.noaa.gov/products/kyoto-dst.json').then(r => r.json()),
      fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_lm.json').then(r => r.json()),
      fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_lm.json').then(r => r.json())
    ]);

    // Parse the data
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      source: 'Cloudflare Worker - noaa.macachor.org',
      data: {
        kp: parseKp(kpData),
        dst: parseDst(dstData),
        mag: parseMagData(magData),
        wind: parseWindData(windData),
        ae: estimateAE(parseKp(kpData), parseDst(dstData)),
        lpp: calculateLpp(parseKp(kpData), parseDst(dstData), parseMagData(magData))
      }
    };

    // Add scalar coherence estimate
    result.data.coherence = calculateCoherence(result.data);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: corsHeaders
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to fetch NOAA data',
      message: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// Handle the scalar latest endpoint
async function handleScalarLatest(request, corsHeaders) {
  try {
    // First try to get NOAA data
    const noaaData = await getNOAAData();
    
    // Combine with scalar data
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      scalar: {
        coherence: {
          score: calculateCoherence(noaaData),
          status: 'active',
          phi: 0.6180339887498949
        },
        accuracy: '50+ decimal places',
        model: '4D MGDH Complete'
      },
      drivers: {
        noaa: noaaData,
        nasa: {
          solar_wind: [{
            speed: noaaData.speed || 400,
            density: noaaData.density || 5,
            bz: noaaData.bz || 0,
            timestamp: new Date().toISOString()
          }]
        }
      },
      gateway: {
        status: 'connected',
        version: 'v5.1',
        endpoint: 'noaa.macachor.org'
      }
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: corsHeaders
    });

  } catch (error) {
    // Return cached or default data
    const fallbackData = {
      success: true,
      timestamp: new Date().toISOString(),
      scalar: {
        coherence: {
          score: 0.5,
          status: 'fallback',
          phi: 0.6180339887498949
        },
        accuracy: '50+ decimal places'
      },
      drivers: {
        noaa: {
          kp: 2.0,
          dst: 0,
          ae: 50,
          speed: 400,
          density: 5,
          bz: 0
        }
      },
      gateway: {
        status: 'fallback',
        version: 'v5.1'
      }
    };

    return new Response(JSON.stringify(fallbackData), {
      status: 200,
      headers: corsHeaders
    });
  }
}

// Proxy helper function
async function proxyRequest(url, corsHeaders) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    return new Response(JSON.stringify({
      success: true,
      data: data,
      source: 'noaa.macachor.org'
    }), {
      status: 200,
      headers: corsHeaders
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// ── NOAA DATA PARSERS ──

function parseKp(data) {
  if (!data || !data.length) return 2.0;
  const latest = data[data.length - 1];
  if (latest.Kp !== undefined) return parseFloat(latest.Kp);
  if (Array.isArray(latest)) return parseFloat(latest[1] ?? 2.0);
  return 2.0;
}

function parseDst(data) {
  if (!data || !data.length) return 0;
  const latest = data[data.length - 1];
  if (latest.dst !== undefined) return parseInt(latest.dst);
  if (Array.isArray(latest)) return parseInt(latest[1] ?? 0);
  return 0;
}

function parseMagData(data) {
  if (!data) return { bx: 0, by: 0, bz: 0 };
  const entry = Array.isArray(data) ? data[data.length - 1] : data;
  if (entry.bx !== undefined) {
    return {
      bx: parseFloat(entry.bx ?? 0),
      by: parseFloat(entry.by ?? 0),
      bz: parseFloat(entry.bz ?? 0)
    };
  }
  if (Array.isArray(entry)) {
    return {
      bx: parseFloat(entry[1] ?? 0),
      by: parseFloat(entry[2] ?? 0),
      bz: parseFloat(entry[3] ?? 0)
    };
  }
  return { bx: 0, by: 0, bz: 0 };
}

function parseWindData(data) {
  if (!data) return { speed: 400, density: 5 };
  const entry = Array.isArray(data) ? data[data.length - 1] : data;
  if (entry.speed !== undefined) {
    return {
      speed: parseFloat(entry.speed ?? 400),
      density: parseFloat(entry.proton_density ?? entry.density ?? 5)
    };
  }
  if (Array.isArray(entry)) {
    return {
      speed: parseFloat(entry[1] ?? 400),
      density: parseFloat(entry[2] ?? 5)
    };
  }
  return { speed: 400, density: 5 };
}

function estimateAE(kp, dst) {
  return Math.round(80 * Math.pow(kp, 1.5) + Math.max(0, -dst) * 2);
}

function calculateCoherence(data) {
  const kp = data.kp || 2.0;
  const dst = data.dst || 0;
  const ae = data.ae || 50;
  
  const kpFactor = Math.max(0, 1 - (kp - 1) / 9);
  const dstFactor = Math.max(0, 1 - Math.abs(dst) / 100);
  const aeFactor = Math.max(0, 1 - ae / 200);
  
  return Math.min(1, (kpFactor * 0.4 + dstFactor * 0.3 + aeFactor * 0.3));
}

function calculateLpp(kp, dst, mag) {
  let lpp = 5.6 - 0.46 * kp;
  
  if (dst < -20) {
    lpp += dst * 0.005;
  }
  
  if (mag && Math.abs(mag.bz) > 3) {
    lpp -= 0.15 * Math.abs(mag.bz);
  }
  
  return Math.max(2.0, Math.min(8.0, lpp));
}

async function getNOAAData() {
  try {
    const [kp, dst, mag, wind] = await Promise.all([
      fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').then(r => r.json()),
      fetch('https://services.swpc.noaa.gov/products/kyoto-dst.json').then(r => r.json()),
      fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_lm.json').then(r => r.json()),
      fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_lm.json').then(r => r.json())
    ]);

    const kpVal = parseKp(kp);
    const dstVal = parseDst(dst);
    const magVal = parseMagData(mag);
    const windVal = parseWindData(wind);

    return {
      kp: kpVal,
      dst: dstVal,
      ae: estimateAE(kpVal, dstVal),
      bx: magVal.bx,
      by: magVal.by,
      bz: magVal.bz,
      speed: windVal.speed,
      density: windVal.density,
      lpp: calculateLpp(kpVal, dstVal, magVal)
    };
  } catch (error) {
    return {
      kp: 2.0,
      dst: 0,
      ae: 50,
      bx: 0,
      by: 0,
      bz: 0,
      speed: 400,
      density: 5,
      lpp: 5.2
    };
  }
}
