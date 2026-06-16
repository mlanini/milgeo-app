// Viewer proxy worker
//
// Serves the web app at a clean subdomain by proxying to the build deployed
// at a static host. Configure the origin via the ORIGIN_URL environment
// variable (set in wrangler.toml [vars] or Cloudflare dashboard secrets).
//
// The app build uses relative asset paths, so requests map 1:1:
//   <worker-domain>/<path>?<query> -> ORIGIN_URL/<path>?<query>
//
// Origin redirects are followed server-side so the worker public URL is
// preserved and ORIGIN_URL is never exposed to the client.

interface Env {
  /** Base URL of the static build to proxy, e.g. https://example.com/demo */
  ORIGIN_URL?: string;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const origin = (env.ORIGIN_URL ?? "").replace(/\/+$/, "");
    if (!origin) {
      return new Response(
        "ORIGIN_URL is not configured. Set it in wrangler.toml [vars] or the Cloudflare dashboard.",
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const target = `${origin}${url.pathname}${url.search}`;

    // Drop credential headers a public static-asset proxy never needs; keep the
    // rest (e.g. Range, Accept-Encoding) so large-asset requests work.
    const headers = new Headers(request.headers);
    headers.delete("cookie");
    headers.delete("authorization");

    // Follow origin redirects (e.g. trailing slash) server-side to preserve the
    // public URL.
    try {
      return await fetch(target, {
        method: request.method,
        headers,
        body:
          request.method === "GET" || request.method === "HEAD"
            ? null
            : request.body,
        redirect: "follow",
      });
    } catch {
      return new Response("Bad Gateway", { status: 502 });
    }
  },
};
