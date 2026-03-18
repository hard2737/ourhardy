/**
 * CloudFront viewer-response function — adds CORS headers to /aux/* responses.
 *
 * Deploy to the www.ourhardy.com CloudFront distribution as a
 * VIEWER_RESPONSE event on the /aux/* behavior (or default behavior).
 *
 * AWS CLI deploy:
 *   aws cloudfront create-function \
 *     --name add-cors-headers \
 *     --function-config '{"Comment":"CORS for aux audio","Runtime":"cloudfront-js-2.0"}' \
 *     --function-code fileb://cloudfront-functions/add-cors-headers.js \
 *     --profile ourhardy
 *
 *   Then publish and associate with the distribution behavior for /aux/*.
 */

function handler(event) {
  var response = event.response;
  var request  = event.request;

  // Only apply to /aux/* paths
  if (!request.uri.startsWith('/aux/')) {
    return response;
  }

  var h = response.headers;
  h['access-control-allow-origin']   = { value: 'https://app.ourhardy.com' };
  h['access-control-allow-methods']  = { value: 'GET, HEAD' };
  h['access-control-allow-headers']  = { value: 'Range, Origin' };
  h['access-control-expose-headers'] = { value: 'Content-Range, Accept-Ranges, Content-Length' };
  h['vary']                          = { value: 'Origin' };

  return response;
}
