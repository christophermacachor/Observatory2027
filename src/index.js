// src/index.js - Complete NOAA API CORS Proxy with /api/noaa/all endpoint

export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now();
    const url = new URL(request.url);
    
    // --- CORS Preflight ---
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Requested-With',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // --- Log request ---
    const clientIP = request.headers.get('cf-connecting-ip') || 'unknown';
    console.log(`📥 ${request.method} ${url.pathname}${url.search} from ${clientIP}`);

    try {
      // --- Proxy NOAA API requests ---
      if (url.pathname.startsWith('/api/noaa/')) {
        // Handle /api/noaa/all - returns all NOAA data at once
        if (url.pathname === '/api/noaa/all') {
          return await handleAllNOAAData();
        }
        
        // Handle specific paths /api/noaa/points/... etc.
        const noaaPath = url.pathname.replace('/api/noaa/', '');
        return await proxyToNOAA(noaaPath, url.search, env);
      }

      // --- Health check endpoint ---
      if (url.pathname === '/health' || url.pathname === '/api/health') {
        return new Response(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          worker: env.APP_NAME || 'observatory2027',
          cache: env.NOAA_CACHE ? 'available' : 'unavailable',
          version: '1.0.0',
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // --- Serve static assets ---
      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error(`💥 Unhandled error: ${error.message}`, error.stack);
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};

// ─── HANDLE /api/noaa/all ────────────────────────────────────────

async function handleAllNOAAData() {
  console.log('🌐 Fetching all NOAA data...');
  
  try {
    // Fetch all NOAA data in parallel
    const [kpData, dstData, magData, windData] = await Promise.all([
      fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')
        .then(r => r.json())
        .catch(() => null),
      fetch('https://services.swpc.noaa.gov/products/kyoto-dst.json')
        .then(r => r.json())
        .catch(() => null),
      fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_lm.json')
        .then(r => r.json())
        .catch(() => null),
      fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_lm.json')
        .then(r => r.json())
        .catch(() => null),
    ]);

    // Parse all data
    const kp = parseKp(kpData);
    const dst = parseDst(dstData);
    const mag = parseMag(magData);
    const wind = parseWind(windData);
    const ae = estimateAE(kp, dst);

    const data = {
      success: true,
      data: {
        kp: kp,
        ae: ae,
        dst: dst,
        bx: mag.bx,
        by: mag.by,
        bz: mag.bz,
        speed: wind.speed,
        density: wind.density,
      },
      metadata: {
        source: 'NOAA API (via Cloudflare Worker)',
        timestamp: new Date().toISOString(),
        kp_source: kpData ? 'NOAA Kp Index' : 'default',
        dst_source: dstData ? 'Kyoto Dst' : 'default',
        mag_source: magData ? 'RTSW MAG' : 'default',
        wind_source: windData ? 'RTSW WIND' : 'default',
      }
    };

    console.log(`✅ NOAA data fetched: Kp=${kp}, Dst=${dst}, Bz=${mag.bz.toFixed(1)}`);

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120', // Cache for 2 minutes
      },
    });

  } catch (error) {
    console.error(`❌ NOAA data fetch error: ${error.message}`);
    
    // Return fallback data
    return new Response(JSON.stringify({
      success: false,
      data: {
        kp: 2.0,
        ae: 50,
        dst: 0,
        bx: 0,
        by: 0,
        bz: 0,
        speed: 400,
        density: 5,
      },
      error: error.message,
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

// ─── PROXY TO NOAA SPECIFIC ENDPOINT ────────────────────────────

async function proxyToNOAA(noaaPath, search, env) {
  if (!noaaPath) {
    return new Response(JSON.stringify({
      error: 'Missing NOAA API path',
      usage: '/api/noaa/points/39.7456,-97.0892',
      example: 'https://space.macachor.org/api/noaa/points/39.7456,-97.0892'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  console.log(`🌐 Proxying to NOAA: ${noaaPath}`);

  const noaaUrl = `https://api.weather.gov/${noaaPath}${search}`;
  
  try {
    const response = await fetch(noaaUrl, {
      headers: {
        'User-Agent': `${env.APP_NAME || 'Observatory2027'}/1.0 (${env.APP_EMAIL || 'contact@macachor.org'})`,
        'Accept': 'application/geo+json, application/json',
        'Accept-Encoding': 'gzip',
      },
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/geo+json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });

  } catch (error) {
    console.error(`❌ NOAA proxy error: ${error.message}`);
    return new Response(JSON.stringify({
      error: 'NOAA API proxy error',
      message: error.message,
      path: noaaPath,
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────

/**
 * Parse Kp index from NOAA data
 */
function parseKp(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return 2.0;
  }
  try {
    const latest = data[data.length - 1];
    if (latest.Kp !== undefined) {
      return parseFloat(latest.Kp) || 2.0;
    }
    if (Array.isArray(latest) && latest.length >= 2) {
      return parseFloat(latest[1]) || 2.0;
    }
    return 2.0;
  } catch (e) {
    console.warn('Kp parse error:', e);
    return 2.0;
  }
}

/**
 * Parse Dst index from Kyoto data
 */
function parseDst(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return 0;
  }
  try {
    const latest = data[data.length - 1];
    if (latest.dst !== undefined) {
      return parseInt(latest.dst) || 0;
    }
    if (Array.isArray(latest) && latest.length >= 2) {
      return parseInt(latest[1]) || 0;
    }
    return 0;
  } catch (e) {
    console.warn('Dst parse error:', e);
    return 0;
  }
}

/**
 * Parse IMF magnetic field data
 */
function parseMag(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return { bx: 0, by: 0, bz: 0 };
  }
  try {
    const latest = data[data.length - 1];
    if (latest.bx !== undefined && latest.by !== undefined && latest.bz !== undefined) {
      return {
        bx: parseFloat(latest.bx) || 0,
        by: parseFloat(latest.by) || 0,
        bz: parseFloat(latest.bz) || 0,
      };
    }
    if (Array.isArray(latest) && latest.length >= 4) {
      return {
        bx: parseFloat(latest[1]) || 0,
        by: parseFloat(latest[2]) || 0,
        bz: parseFloat(latest[3]) || 0,
      };
    }
    return { bx: 0, by: 0, bz: 0 };
  } catch (e) {
    console.warn('Mag parse error:', e);
    return { bx: 0, by: 0, bz: 0 };
  }
}

/**
 * Parse solar wind data
 */
function parseWind(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return { speed: 400, density: 5 };
  }
  try {
    const latest = data[data.length - 1];
    if (latest.speed !== undefined && latest.proton_density !== undefined) {
      return {
        speed: parseFloat(latest.speed) || 400,
        density: parseFloat(latest.proton_density) || 5,
      };
    }
    if (latest.speed !== undefined && latest.density !== undefined) {
      return {
        speed: parseFloat(latest.speed) || 400,
        density: parseFloat(latest.density) || 5,
      };
    }
    if (Array.isArray(latest) && latest.length >= 3) {
      return {
        speed: parseFloat(latest[1]) || 400,
        density: parseFloat(latest[2]) || 5,
      };
    }
    return { speed: 400, density: 5 };
  } catch (e) {
    console.warn('Wind parse error:', e);
    return { speed: 400, density: 5 };
  }
}

/**
 * Estimate AE index from Kp and Dst
 */
function estimateAE(kp, dst) {
  return Math.round(80 * Math.pow(kp, 1.5) + Math.max(0, -dst) * 2);
}

/**
 * Calculate plasmapause L-shell position
 */
function plasmapauseL(kp, dst, bz, by) {
  // Carpenter-Anderson model (base)
  let lpp = 5.6 - 0.46 * kp;
  
  // O'Brien-Moldwin correction for storm conditions
  if (dst < -20 || (80 * Math.pow(kp, 1.5) + Math.max(0, -dst) * 2) > 100) {
    lpp = 5.39 - 0.382 * kp - 0.001 * (80 * Math.pow(kp, 1.5) + Math.max(0, -dst) * 2) - 0.005 * Math.max(0, -dst);
  }
  
  // Larsen correction for IMF orientation
  if (Math.abs(bz) > 2) {
    const clockAngle = Math.atan2(by, bz);
    const phi = Math.sqrt(by * by + bz * bz);
    lpp = 5.2 - 0.3 * kp - 0.15 * phi * Math.cos(clockAngle) - 0.05 * Math.max(0, -dst);
  }
  
  return Math.max(2.0, Math.min(8.0, lpp));
}
