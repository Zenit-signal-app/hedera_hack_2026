const APPKIT_PROJECT_ID = "a80f311908bca2372838839cc25aed98";

const APPKIT_ENDPOINTS = [
  "api.web3modal.org/appkit/v1/config",
  "pulse.walletconnect.org/e",
];

function rewriteAppKitUrl(urlString: string) {
  try {
    const parsed = new URL(urlString);
    const matchesEndpoint = APPKIT_ENDPOINTS.some((endpoint) => parsed.href.includes(endpoint));
    if (!matchesEndpoint) {
      return urlString;
    }

    parsed.searchParams.set("projectId", APPKIT_PROJECT_ID);
    return parsed.toString();
  } catch {
    return urlString;
  }
}

function cloneWithUrl(request: Request, url: string) {
  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
    body: request.body,
    mode: request.mode,
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
    signal: request.signal,
  };
  return new Request(url, init);
}

const originalFetch = window.fetch.bind(window);

window.fetch = (...args) => {
  let [resource, init] = args;

  if (typeof resource === "string") {
    resource = rewriteAppKitUrl(resource);
  } else if (resource instanceof Request) {
    const rewritten = rewriteAppKitUrl(resource.url);
    if (rewritten !== resource.url) {
      resource = cloneWithUrl(resource, rewritten);
    }
  }

  return originalFetch(resource as RequestInfo, init);
};

export {};
