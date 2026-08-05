export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Proxy requests to NOAA API
    if (url.pathname.startsWith("/api/noaa/")) {
      // Build the NOAA target URL
      const noaaPath = url.pathname.replace("/api/noaa/", "");
      const noaaUrl = `https://api.weather.gov/${noaaPath}${url.search}`;

      const noaaResponse = await fetch(noaaUrl, {
        headers: { "User-Agent": "your-app (your-email@example.com)" },
      });

      const data = await noaaResponse.text();
      return new Response(data, {
        status: noaaResponse.status,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/geo+json",
        },
      });
    }

    // Everything else: serve static assets
    return env.ASSETS.fetch(request);
  },
};
