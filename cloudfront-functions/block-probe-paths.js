/**
 * CloudFront Function: block common probe paths (viewer request).
 * Returns 403 for *.php and WordPress/admin/cgi paths; passes all other requests.
 * Attach to the default cache behavior (Viewer request).
 */
function handler(event) {
  var request = event.request;
  var uri = (request.uri || "").toLowerCase();

  // Block paths that look like probes (static site has no .php or wp-*)
  if (uri.match(/\.php$/))
    return block();
  if (uri.indexOf("/wp-admin") === 0)
    return block();
  if (uri.indexOf("/wp-content") === 0)
    return block();
  if (uri.indexOf("/wp-includes") === 0)
    return block();
  if (uri.indexOf("/cgi-bin") === 0)
    return block();
  // Optional: block .well-known only when it's a .php probe (keep ACME if you use it)
  if (uri.indexOf("/.well-known/") === 0 && uri.indexOf(".php") !== -1)
    return block();

  return request;
}

function block() {
  return {
    // HTTP status (403 = Forbidden). Keep as 403 for probes.
    statusCode: 403,
    // Reason phrase in the HTTP response line (e.g. "Nope" → "HTTP/2 403 Nope").
    statusDescription: "Nope",
    // Response headers. Use lowercase names; value is { value: "..." }.
    headers: {
      "content-type": { value: "text/plain; charset=utf-8" }
      // Add more if you like: "x-custom": { value: "hello" }
    },
    // Body shown in the browser. Plain text only (or use body: { data: "...", encoding: "text" }).
    body: "Nothing to see here, friend."
  };
}
