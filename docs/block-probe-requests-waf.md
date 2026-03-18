# Blocking probe requests with AWS WAF

Attach **AWS WAF** to your CloudFront distribution (E359Q5YGQ4LUI6) and add rules that block or count requests to common probe paths. Probed paths observed in your logs are listed in `probed-paths-from-logs.txt`.

## Option 1: Block by pattern (recommended)

Use a small set of rules that match most probes without maintaining a long list.

### In AWS WAF (Console)

1. **WAF & Shield** → **Web ACLs** → Create or edit a web ACL (e.g. `ourhardy-block-probes`).
2. **Add rules** (all with action **Block**):

| Rule type | Field | Match type | Value |
|-----------|--------|------------|--------|
| Rule 1 | URI path | Starts with string | `/wp-admin` |
| Rule 2 | URI path | Starts with string | `/wp-content` |
| Rule 3 | URI path | Starts with string | `/wp-includes` |
| Rule 4 | URI path | Starts with string | `/cgi-bin` |
| Rule 5 | URI path | Starts with string | `/.well-known` (only if you don’t use ACME/.well-known) |
| Rule 6 | URI path | Regex match | `.*\.php$` (any path ending in `.php`) |

3. **Associate** the web ACL with your CloudFront distribution (E359Q5YGQ4LUI6).

**Note:** If you use `/.well-known/` for ACME (e.g. Let’s Encrypt), do **not** block `/.well-known`; the probes were for `/.well-known/*.php`, which you can block with a more specific regex if needed.

### Regex for “any .php request”

- **Pattern:** `.*\.php$`
- In WAF: create a **Regex match set** for URI path with this pattern, then a rule that uses it and blocks.

This blocks all requests whose path ends with `.php`, which matches almost all probe traffic in your logs and is safe for a static HTML/JS/CSS site.

---

## Option 2: Block exact paths from the list

If you prefer to block only the paths that were actually probed:

1. In WAF, create a **string match rule**.
2. **Scope:** URI path.
3. **Match type:** “Starts with” or “Exactly”.
4. Add the path prefixes or paths from `probed-paths-from-logs.txt` (excluding any that are legitimate for your site, e.g. `react/`, `apple-touch-icon` if you add one later).

WAF has limits on the number of strings per rule (e.g. 10,000); your list is well under that.

---

## Option 3: CloudFront Function (no WAF cost)

A **CloudFront Function** (viewer request) can block by path before the request hits S3:

```javascript
function handler(event) {
  var path = event.request.uri.toLowerCase();
  if (path.endsWith('.php') || path.startsWith('/wp-admin') || path.startsWith('/wp-content') || path.startsWith('/wp-includes') || path.startsWith('/cgi-bin'))
    return { statusCode: 403, statusDescription: 'Forbidden' };
  return event.request;
}
```

Attach it to the default cache behavior (viewer request). No WAF subscription cost; minimal latency.

---

## Summary

- **Full list of probed paths:** `docs/probed-paths-from-logs.txt`
- **Easiest blocking:** WAF rule on URI path **regex** `.*\.php$` plus 3–4 “Starts with” rules for `/wp-admin`, `/wp-content`, `/wp-includes`, `/cgi-bin`.
- **No WAF:** Use a CloudFront Function that returns 403 for the same patterns.
