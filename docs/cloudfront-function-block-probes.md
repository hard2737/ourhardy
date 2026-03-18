# Implement Option 3: CloudFront Function to block probe requests

This uses a **CloudFront Function** (viewer request) to return 403 for probe paths (`.php`, `/wp-admin`, `/wp-content`, `/wp-includes`, `/cgi-bin`) so the request never hits S3. No WAF subscription cost.

---

## 1. Function code

The function lives in **`cloudfront-functions/block-probe-paths.js`**. Logic:

- Normalize URI to lowercase.
- If path **ends with `.php`** → 403.
- If path **starts with** `/wp-admin`, `/wp-content`, `/wp-includes`, or `/cgi-bin` → 403.
- If path starts with `/.well-known/` and contains `.php` → 403 (so `/.well-known/acme-challenge/` for Let’s Encrypt still works).
- Otherwise → pass through (`return request`).

---

## 2. Create and publish the function in AWS

### Console

1. **CloudFront** → **Functions** (left sidebar) → **Create function**.
2. **Name:** `block-probe-paths` (or any name).
3. **Description:** e.g. `Block probe paths (.php, wp-admin, etc.)`.
4. **Build** tab: paste the contents of `cloudfront-functions/block-probe-paths.js` into the editor.
5. **Save changes**.
6. **Publish** tab → **Publish function** (creates `LATEST` and a new stage, e.g. `LIVE`).

### CLI

Run from the repo root (so `cloudfront-functions/block-probe-paths.js` exists):

```bash
# Create (must run from repo root)
aws cloudfront create-function \
  --name block-probe-paths \
  --function-config Comment="Block probe paths",Runtime="cloudfront-js-1.0" \
  --function-code fileb://cloudfront-functions/block-probe-paths.js \
  --profile ourhardy

# Publish (use the ETag from create-function output for --if-match)
aws cloudfront publish-function \
  --name block-probe-paths \
  --if-match ETAG_FROM_CREATE \
  --profile ourhardy
```

---

## 3. Attach to your distribution

Attach the function to the **default cache behavior** as a **Viewer request** function.

### Console

1. **CloudFront** → **Distributions** → open **E359Q5YGQ4LUI6** (ourhardy.com).
2. **Behaviors** tab → select the **Default (\*)** behavior → **Edit**.
3. **Viewer request**:
   - Choose **CloudFront Functions**.
   - Function: **block-probe-paths** (and the stage you published, e.g. **LIVE**).
4. **Save changes**. Wait for the distribution to finish deploying (status **Deployed**).

### CLI

```bash
# 1. Get current config and ETag
aws cloudfront get-distribution-config --id E359Q5YGQ4LUI6 --profile ourhardy > dist-config.json

# 2. Edit dist-config.json:
#    In DefaultCacheBehavior, set:
#    "ViewerFunctionARN": "arn:aws:cloudfront::ACCOUNT_ID:function/block-probe-paths"
#    (Use the function ARN from the Functions page; stage is usually omitted or use :LIVE)
#    Remove "FunctionAssociations" if it exists and you're replacing, or set Items to include
#    { "EventType": "viewer-request", "FunctionARN": "arn:aws:cloudfront::ACCOUNT_ID:function/block-probe-paths" }

# 3. Update (use ETag from step 1 for --if-match)
aws cloudfront update-distribution \
  --id E359Q5YGQ4LUI6 \
  --if-match ETAG \
  --distribution-config file://dist-config-modified.json \
  --profile ourhardy
```

For CLI, the correct field is **FunctionAssociations** under the cache behavior: `EventType: viewer-request`, `FunctionARN: arn:aws:cloudfront::ACCOUNT_ID:function/block-probe-paths`.

---

## 4. Verify

After the distribution is deployed:

- **Allowed:**  
  `https://www.ourhardy.com/`  
  `https://www.ourhardy.com/index.html`  
  `https://www.ourhardy.com/react/...`  
  `https://www.ourhardy.com/robots.txt`

- **Blocked (403):**  
  `https://www.ourhardy.com/wp-admin/`  
  `https://www.ourhardy.com/config.php`  
  `https://www.ourhardy.com/any-path.php`

```bash
curl -sI https://www.ourhardy.com/wp-admin/
# Expect: HTTP/2 403

curl -sI https://www.ourhardy.com/
# Expect: HTTP/2 200
```

---

## 5. Updating the function later

1. **CloudFront** → **Functions** → **block-probe-paths**.
2. **Build** tab → edit code → **Save changes**.
3. **Publish** tab → **Publish function**.
4. No need to change the behavior; the association already points at the function, and published updates apply automatically.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Use code in `cloudfront-functions/block-probe-paths.js`. |
| 2 | Create function in CloudFront (Console or CLI), then **Publish**. |
| 3 | Edit default behavior → Viewer request → CloudFront Functions → **block-probe-paths**. |
| 4 | Save; wait for deployment; test with `curl` to `/` (200) and `/wp-admin/` or `/.php` (403). |
