// functions/api/noaa/all.js
// Handles: https://macachor.org/api/noaa/all

export async function onRequest(context) {
  const { request, env, params } = context;
  
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    // Fetch all NOAA data in parallel
    const [kpData, dstData, magData, windData] = await Promise.all([
      fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').then(r => r.json()),
      fetch('https://services.swpc.noaa.gov/products/kyoto-dst.json').then(r => r.json()),
      fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_lm.json').then(r => r.json()),
      fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_lm.json').then(r => r.json())
    ]);

    // Parse data
    const kp = parseKp(kpData);
    const dst = parseDst(dstData);
    const mag = parseMagData(magData);
    const wind = parseWindData(windData);
    const ae = estimateAE(kp, dst);
    const lpp = calculateLpp(kp, dst, mag);

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      source: 'Cloudflare Pages Function',
      data: {
        kp: kp,
        dst: dst,
        ae: ae,
        bx: mag.bx,
        by: mag.by,
        bz: mag.bz,
        speed: wind.speed,
        density: wind.density,
        lpp: lpp,
        coherence: calculateCoherence({ kp, dst, ae })
      }
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers
    });
  }
}

// Parser functions
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
  if (dst < -20) lpp += dst * 0.005;
  if (mag && Math.abs(mag.bz) > 3) lpp -= 0.15 * Math.abs(mag.bz);
  return Math.max(2.0, Math.min(8.0, lpp));
}
