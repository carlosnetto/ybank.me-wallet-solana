export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const apiPaths = ['/fetch', '/generate', '/notify'];

    if (apiPaths.includes(url.pathname)) {
      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }

      // Proxy to the cloudflared tunnel
      const targetUrl = `${env.API_TUNNEL_URL}${url.pathname}`;
      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      const response = await fetch(proxyRequest);
      const newResponse = new Response(response.body, response);
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      return newResponse;
    }

    // Serve static assets for everything else
    return env.ASSETS.fetch(request);
  },
};
