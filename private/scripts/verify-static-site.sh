#!/usr/bin/env bash
set -euo pipefail

# Usage: ./verify-static-site.sh <domain> [--fix | --fix-dns | --fix-default-root | --fix-origin | --fix-oac | --fix-listbucket]
# Example: ./verify-static-site.sh www.ourhardy.com
#          ./verify-static-site.sh www.ourhardy.com --fix-dns             # point DNS to CloudFront
#          ./verify-static-site.sh www.ourhardy.com --fix-default-root   # set CloudFront default to index.html
#          ./verify-static-site.sh www.ourhardy.com --fix-origin          # switch origin to S3 REST endpoint
#          ./verify-static-site.sh www.ourhardy.com --fix-oac             # attach OAC to origin (fixes 403)
#          ./verify-static-site.sh www.ourhardy.com --fix-listbucket      # add s3:ListBucket so missing keys return 404
# Checks: S3 website endpoint, ACM us-east-1, public bucket policy, CloudFront CNAMEs, ALIAS records
DOMAIN="${1:?Usage: $0 <domain> e.g. www.ourhardy.com}"
FIX_MODE="${2:-}"
# Base zone name (ourhardy.com for both ourhardy.com and www.ourhardy.com)
[[ "$DOMAIN" == www.* ]] && ZONE_NAME="${DOMAIN#www.}" || ZONE_NAME="$DOMAIN"
BUCKET="${BUCKET:-$ZONE_NAME}"

# Use AWS profile for all aws CLI calls (override with AWS_PROFILE=other if needed)
export AWS_PROFILE="${AWS_PROFILE:-ourhardy}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

function info()  { echo -e "${YELLOW}ℹ $1${NC}"; }
function ok()    { echo -e "${GREEN}✔ $1${NC}"; }
function error() { echo -e "${RED}✖ $1${NC}"; }

function require_tools() {
  command -v aws >/dev/null || { error "aws CLI not installed"; exit 1; }
  command -v jq >/dev/null || { error "jq not installed"; exit 1; }
  command -v dig >/dev/null || { error "dig not installed"; exit 1; }
  ok "Required tools present"
}

function check_bucket_exists() {
  info "Checking S3 bucket exists..."
  if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
    ok "Bucket exists"
  else
    error "Bucket $BUCKET does not exist"
    exit 1
  fi
}

function check_bucket_has_index() {
  info "Checking S3 bucket has index.html at root..."
  HEAD_OUT=$(aws s3api head-object --bucket "$BUCKET" --key "index.html" 2>&1)
  HEAD_RC=$?
  if [[ $HEAD_RC -eq 0 ]]; then
    ok "index.html exists in bucket"
  elif echo "$HEAD_OUT" | grep -q "404\|NoSuchKey"; then
    error "Bucket has no index.html at root; CloudFront will return 404 for /. Upload: aws s3 cp index.html s3://$BUCKET/index.html --profile ourhardy"
  else
    # 403 Access Denied or other error: object may exist but CLI profile lacks s3:GetObject
    info "Cannot read index.html via CLI (profile may lack s3:GetObject); assuming present if console shows it"
    ok "index.html check skipped (permission denied)"
  fi
}

function check_block_public_access() {
  info "Checking Block Public Access..."
  BPA=$(aws s3api get-public-access-block --bucket "$BUCKET" 2>/dev/null || echo "")
  if [[ -z "$BPA" ]]; then
    error "No Public Access Block config"
    if [[ "$FIX_MODE" == "--fix" ]]; then
      info "Enabling Block Public Access..."
      aws s3api put-public-access-block \
        --bucket "$BUCKET" \
        --public-access-block-configuration \
        BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
      ok "Block Public Access enabled"
    fi
  else
    ok "Public Access Block configured"
  fi
}

function check_public_policy() {
  info "Checking for public bucket policy (Principal '*' = bad; CloudFront OAC = ok)..."
  POLICY=$(aws s3api get-bucket-policy --bucket "$BUCKET" 2>/dev/null || echo "")
  if [[ -z "$POLICY" ]]; then
    ok "No bucket policy"
    return
  fi
  if echo "$POLICY" | grep -q '"Principal": "\*"' || echo "$POLICY" | grep -q '"AWS": "\*"'; then
    error "Public bucket policy detected (Principal * or AWS *)"
    if [[ "$FIX_MODE" == "--fix" ]]; then
      info "Removing bucket policy..."
      aws s3api delete-bucket-policy --bucket "$BUCKET"
      ok "Public policy removed"
    fi
  elif echo "$POLICY" | grep -q 'cloudfront.amazonaws.com'; then
    ok "Bucket policy allows CloudFront only (OAC)"
  else
    ok "No public bucket policy"
  fi
}

function check_bucket_policy_matches_distribution() {
  info "Checking bucket policy allows this CloudFront distribution..."
  POLICY_JSON=$(aws s3api get-bucket-policy --bucket "$BUCKET" --query "Policy" --output text 2>/dev/null | jq -r . 2>/dev/null || true)
  if [[ -z "$POLICY_JSON" ]]; then
    error "No bucket policy; add OAC policy allowing distribution $DIST_ID (CloudFront console offers Copy policy)"
    return
  fi
  if echo "$POLICY_JSON" | grep -q "$DIST_ID"; then
    ok "Bucket policy SourceArn includes distribution $DIST_ID"
  else
    error "Bucket policy does not allow distribution $DIST_ID (403 from S3). In CloudFront: distribution -> Origins -> Edit origin -> Copy policy, then paste into S3 bucket policy."
  fi
}

function check_bucket_policy_list_bucket() {
  info "Checking bucket policy has s3:ListBucket (so missing keys return 404 not 403)..."
  POLICY_JSON=$(aws s3api get-bucket-policy --bucket "$BUCKET" --query "Policy" --output text 2>/dev/null | jq -r . 2>/dev/null || true)
  if [[ -z "$POLICY_JSON" ]]; then
    return
  fi
  if echo "$POLICY_JSON" | grep -q 'ListBucket'; then
    ok "Bucket policy includes s3:ListBucket; missing pages return 404"
  else
    error "Bucket policy has GetObject only; S3 returns 403 for missing keys. Add s3:ListBucket on the bucket ARN (arn:aws:s3:::${BUCKET}) for CloudFront so missing pages return 404."
  fi
}

function fix_bucket_policy_list_bucket() {
  info "Adding s3:ListBucket to bucket policy (missing keys will return 404)..."
  POLICY_JSON=$(aws s3api get-bucket-policy --bucket "$BUCKET" --output json 2>/dev/null | jq -r '.Policy' 2>/dev/null | jq . 2>/dev/null || true)
  if [[ -z "$POLICY_JSON" ]]; then
    error "No bucket policy or could not parse; add OAC policy first (e.g. --fix-oac then set policy from CloudFront Copy policy)"
    return 1
  fi
  if echo "$POLICY_JSON" | grep -q 'ListBucket'; then
    ok "Bucket policy already has s3:ListBucket"
    return 0
  fi
  ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
  [[ -z "$ACCOUNT" ]] && { error "Could not get AWS account ID"; return 1; }
  SOURCE_ARN="arn:aws:cloudfront::${ACCOUNT}:distribution/${DIST_ID}"
  NEW_STMT=$(jq -n \
    --arg bucket "arn:aws:s3:::${BUCKET}" \
    --arg arn "$SOURCE_ARN" \
    '{Sid: "AllowCloudFrontListBucket", Effect: "Allow", Principal: {Service: "cloudfront.amazonaws.com"}, Action: "s3:ListBucket", Resource: $bucket, Condition: {StringEquals: {"AWS:SourceArn": $arn}}}')
  NEW_POLICY=$(echo "$POLICY_JSON" | jq --argjson stmt "$NEW_STMT" '.Statement += [$stmt]')
  aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$NEW_POLICY" >/dev/null
  ok "Added s3:ListBucket statement; missing pages will return 404"
}

function find_distribution() {
  info "Searching CloudFront distribution for $ZONE_NAME / $DOMAIN..."
  DIST_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Aliases.Items && (contains(Aliases.Items, '$DOMAIN') || contains(Aliases.Items, '$ZONE_NAME'))].Id" \
    --output text | head -1)

  if [[ -z "$DIST_ID" ]]; then
    error "No CloudFront distribution found for $DOMAIN or $ZONE_NAME"
    exit 1
  fi

  ok "Found distribution: $DIST_ID"
  CF_ALIASES=$(aws cloudfront get-distribution --id "$DIST_ID" \
    --query "Distribution.DistributionConfig.Aliases.Items" --output text 2>/dev/null || true)
  info "CloudFront alternate domain names: ${CF_ALIASES:-none}"
}

function check_cloudfront_default_root() {
  info "Checking CloudFront default root object..."
  ROOT=$(aws cloudfront get-distribution --id "$DIST_ID" --query "Distribution.DistributionConfig.DefaultRootObject" --output text 2>/dev/null || true)
  if [[ -z "$ROOT" || "$ROOT" == "None" ]]; then
    error "CloudFront has no default root object; / returns 404. Set to index.html (e.g. run with --fix-default-root)"
  else
    ok "Default root object: $ROOT"
  fi
}

function check_cloudfront_origin() {
  info "Checking CloudFront origin (S3 REST vs website endpoint)..."
  ORIGIN_DOMAIN=$(aws cloudfront get-distribution --id "$DIST_ID" \
    --query "Distribution.DistributionConfig.Origins.Items[0].DomainName" --output text 2>/dev/null || true)
  ORIGIN_PATH=$(aws cloudfront get-distribution --id "$DIST_ID" \
    --query "Distribution.DistributionConfig.Origins.Items[0].OriginPath" --output text 2>/dev/null || true)
  if [[ "$ORIGIN_DOMAIN" == *"s3-website"* ]]; then
    error "Origin is S3 website endpoint ($ORIGIN_DOMAIN). Use S3 REST endpoint (e.g. $BUCKET.s3.REGION.amazonaws.com) with OAC so default root object works; then set origin in CloudFront to that domain."
  elif [[ -n "$ORIGIN_PATH" && "$ORIGIN_PATH" != "None" ]]; then
    info "Origin path is set to '$ORIGIN_PATH'; requested key for / is ${ORIGIN_PATH#/}/index.html"
    ok "Origin domain: $ORIGIN_DOMAIN"
  else
    ok "Origin: $ORIGIN_DOMAIN (REST endpoint)"
  fi
}

function check_cloudfront_origin_oac() {
  info "Checking origin has Origin Access Control (OAC) attached..."
  OAC_ID=$(aws cloudfront get-distribution --id "$DIST_ID" \
    --query "Distribution.DistributionConfig.Origins.Items[0].OriginAccessControlId" --output text 2>/dev/null || true)
  if [[ -z "$OAC_ID" || "$OAC_ID" == "None" ]]; then
    error "Origin has no OAC; CloudFront requests to S3 are unsigned so S3 returns 403. In CloudFront: Origins -> Edit origin -> Origin access = Origin access control -> Create control or select existing -> Save; then update S3 bucket policy from the new Copy policy."
  else
    ok "Origin OAC: $OAC_ID"
  fi
}

function fix_cloudfront_origin() {
  info "Switching CloudFront origin to S3 REST endpoint..."
  LOC=$(aws s3api get-bucket-location --bucket "$BUCKET" --output text 2>/dev/null || true)
  [[ -z "$LOC" || "$LOC" == "None" ]] && REGION="us-east-1" || REGION="$LOC"
  REST_DOMAIN="$BUCKET.s3.$REGION.amazonaws.com"
  CF_JSON=$(aws cloudfront get-distribution-config --id "$DIST_ID" --output json)
  ETAG=$(echo "$CF_JSON" | jq -r '.ETag')
  CONFIG=$(echo "$CF_JSON" | jq --arg dom "$REST_DOMAIN" '.DistributionConfig | .Origins.Items[0].DomainName = $dom')
  aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" --distribution-config "$CONFIG" >/dev/null
  ok "Origin set to $REST_DOMAIN (deployment may take a few minutes)"
}

function fix_cloudfront_oac() {
  info "Attaching Origin Access Control (OAC) to origin..."
  OAC_ID=$(aws cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[0].Id" --output text 2>/dev/null || true)
  if [[ -z "$OAC_ID" || "$OAC_ID" == "None" ]]; then
    info "No existing OAC; creating one..."
    OAC_ID=$(aws cloudfront create-origin-access-control \
      --origin-access-control-config '{"Name":"oac-s3-static","Description":"OAC for S3 static site","SigningProtocol":"sigv4","SigningBehavior":"always","OriginAccessControlOriginType":"s3"}' \
      --query "OriginAccessControl.Id" --output text 2>/dev/null)
  fi
  if [[ -z "$OAC_ID" || "$OAC_ID" == "None" ]]; then
    error "Could not get or create OAC"
    return 1
  fi
  CF_JSON=$(aws cloudfront get-distribution-config --id "$DIST_ID" --output json)
  ETAG=$(echo "$CF_JSON" | jq -r '.ETag')
  CONFIG=$(echo "$CF_JSON" | jq --arg oac "$OAC_ID" '
    .DistributionConfig | 
    .Origins.Items[0].OriginAccessControlId = $oac |
    .Origins.Items[0].S3OriginConfig = ((.Origins.Items[0].S3OriginConfig // {}) + {"OriginAccessIdentity": ""}) |
    .Origins.Items[0] |= del(.CustomOriginConfig)
  ')
  aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" --distribution-config "$CONFIG" >/dev/null
  ok "Origin OAC set to $OAC_ID (deployment may take a few minutes)"
}

function fix_cloudfront_default_root() {
  info "Setting CloudFront default root object to index.html..."
  CF_JSON=$(aws cloudfront get-distribution-config --id "$DIST_ID" --output json)
  ETAG=$(echo "$CF_JSON" | jq -r '.ETag')
  CONFIG=$(echo "$CF_JSON" | jq '.DistributionConfig | .DefaultRootObject = "index.html"')
  aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" --distribution-config "$CONFIG" >/dev/null
  ok "Default root object set to index.html (propagation may take a few minutes)"
}

# CloudFront hosted zone ID (same for all distributions)
CF_ZONE_ID="Z2FDTNDATAQYW2"

function fix_dns_route53() {
  info "Fix DNS: point apex and www to CloudFront..."
  if [[ -z "${DIST_ID:-}" ]]; then
    find_distribution
  fi
  CF_DOMAIN=$(aws cloudfront get-distribution --id "$DIST_ID" --query "Distribution.DomainName" --output text)
  [[ "$CF_DOMAIN" != *"."* ]] && { error "Could not get CloudFront domain"; return 1; }
  # Ensure trailing dot for Route 53
  CF_DNS="${CF_DOMAIN}."
  ZONE_ID=$(aws route53 list-hosted-zones --query "HostedZones[?Name=='$ZONE_NAME.'].Id" --output text | sed 's/\/hostedzone\///' | tr -d ' \n')
  if [[ -z "$ZONE_ID" ]]; then
    error "Hosted zone not found for $ZONE_NAME"
    return 1
  fi
  CHANGE=$(jq -n \
    --arg apex "$ZONE_NAME." \
    --arg www "www.$ZONE_NAME." \
    --arg cfzone "$CF_ZONE_ID" \
    --arg cfdns "$CF_DNS" \
    '{
      Changes: [
        { Action: "UPSERT", ResourceRecordSet: { Name: $apex, Type: "A", AliasTarget: { HostedZoneId: $cfzone, DNSName: $cfdns, EvaluateTargetHealth: false } } },
        { Action: "UPSERT", ResourceRecordSet: { Name: $www, Type: "A", AliasTarget: { HostedZoneId: $cfzone, DNSName: $cfdns, EvaluateTargetHealth: false } } }
      ]
    }')
  aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --change-batch "$CHANGE"
  ok "Route 53 updated: $ZONE_NAME and www.$ZONE_NAME now alias to $CF_DOMAIN"
}

function check_acm_cert() {
  info "Checking ACM certificate in us-east-1 (required for CloudFront)..."
  CERT_APEX=$(aws acm list-certificates --region us-east-1 --output json 2>/dev/null | jq -r --arg d "$ZONE_NAME" '.CertificateSummaryList[] | select(.DomainName == $d or .DomainName == ("*." + $d)) | .CertificateArn' | head -1)
  CERT_WWW=$(aws acm list-certificates --region us-east-1 --output json 2>/dev/null | jq -r --arg d "www.$ZONE_NAME" '.CertificateSummaryList[] | select(.DomainName == $d) | .CertificateArn' | head -1)
  CERT="${CERT_APEX:-$CERT_WWW}"
  if [[ -z "$CERT" ]]; then
    error "No ACM certificate found for $ZONE_NAME or www.$ZONE_NAME in us-east-1"
  else
    REGION=$(aws acm describe-certificate --certificate-arn "$CERT" --region us-east-1 --query "Certificate.DomainName" --output text 2>/dev/null)
    STATUS=$(aws acm describe-certificate --certificate-arn "$CERT" --region us-east-1 --query "Certificate.Status" --output text 2>/dev/null)
    if [[ "$STATUS" != "ISSUED" ]]; then
      error "ACM certificate not issued (status: $STATUS)"
    else
      ok "ACM certificate valid in us-east-1"
    fi
  fi
}

function check_cloudfront_cnames() {
  info "Checking both CNAMEs (apex + www) are in CloudFront..."
  if [[ -z "${DIST_ID:-}" ]]; then
    find_distribution
  fi
  ALIASES=$(aws cloudfront get-distribution --id "$DIST_ID" --query "Distribution.DistributionConfig.Aliases.Items" --output json 2>/dev/null | jq -r '.[]')
  HAS_APEX=false
  HAS_WWW=false
  while IFS= read -r a; do
    [[ "$a" == "$ZONE_NAME" ]] && HAS_APEX=true
    [[ "$a" == "www.$ZONE_NAME" ]] && HAS_WWW=true
  done <<< "$ALIASES"
  if [[ "$HAS_APEX" == true && "$HAS_WWW" == true ]]; then
    ok "Both $ZONE_NAME and www.$ZONE_NAME in CloudFront"
  else
    error "Add both CNAMEs to CloudFront: $ZONE_NAME and www.$ZONE_NAME (have: $ALIASES)"
  fi
}

function check_route53() {
  info "Checking Route53 (zone: $ZONE_NAME)..."
  ZONE_ID=$(aws route53 list-hosted-zones \
    --query "HostedZones[?Name=='$ZONE_NAME.'].Id" \
    --output text | sed 's/\/hostedzone\///' | tr -d ' \n')

  if [[ -z "$ZONE_ID" ]]; then
    error "Hosted zone not found for $ZONE_NAME"
    exit 1
  fi
  ok "Hosted zone: $ZONE_ID"

  RECORDS_JSON=$(aws route53 list-resource-record-sets --hosted-zone-id "$ZONE_ID" --output json)
  # Check A records for apex and www
  for RECORD_NAME in "$ZONE_NAME" "www.$ZONE_NAME"; do
    TARGET=$(echo "$RECORDS_JSON" | jq -r --arg n "$RECORD_NAME." '.ResourceRecordSets[] | select(.Name == $n and (.Type == "A" or .Type == "AAAA")) | .AliasTarget.DNSName // empty' | head -1)
    if [[ -z "$TARGET" ]]; then
      TARGET=$(echo "$RECORDS_JSON" | jq -r --arg n "$RECORD_NAME." '.ResourceRecordSets[] | select(.Name == $n and .Type == "A") | "no-alias"' | head -1)
    fi
    HAS_ALIAS=$(echo "$RECORDS_JSON" | jq -r --arg n "$RECORD_NAME." '.ResourceRecordSets[] | select(.Name == $n and (.Type == "A" or .Type == "AAAA")) | if .AliasTarget then "yes" else "no" end' | head -1)

    if [[ "$TARGET" == *"s3-website"* ]]; then
      error "Using S3 static website endpoint for $RECORD_NAME (DNS points to $TARGET). Point to CloudFront instead."
    elif [[ "$TARGET" == *"cloudfront.net"* ]]; then
      ok "DNS $RECORD_NAME -> CloudFront (ALIAS)"
    elif [[ "$HAS_ALIAS" == "no" && -n "$TARGET" ]]; then
      error "DNS $RECORD_NAME should use ALIAS record to CloudFront (apex cannot use CNAME)"
    elif [[ -z "$TARGET" ]]; then
      error "No A/AAAA record for $RECORD_NAME pointing to CloudFront"
    else
      ok "DNS $RECORD_NAME -> $TARGET (ALIAS)"
    fi
  done
}

function test_https() {
  info "Testing HTTPS endpoint (timeout 15s)..."
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 --max-time 15 "https://$DOMAIN" || true)
  if [[ "$STATUS" == "200" ]]; then
    ok "HTTPS returns 200"
  elif [[ -z "$STATUS" || "$STATUS" == "000" ]]; then
    error "HTTPS failed (timeout or connection error). Likely cause: DNS still points to S3 website instead of CloudFront."
  elif [[ "$STATUS" == "404" ]]; then
    error "HTTPS returned 404. Ensure index.html exists in s3://$BUCKET/ and CloudFront has finished deploying (default root object change can take a few minutes)."
  elif [[ "$STATUS" == "403" ]]; then
    error "HTTPS returned 403. S3 is rejecting CloudFront: ensure bucket policy SourceArn matches distribution $DIST_ID and origin uses OAC (see check above)."
  else
    error "HTTPS returned $STATUS"
  fi
}

function test_s3_direct_access() {
  info "Testing direct S3 access is blocked..."
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://$BUCKET.s3.amazonaws.com/index.html")

  if [[ "$STATUS" == "403" ]]; then
    ok "Direct S3 access blocked"
  else
    error "S3 is publicly accessible (status: $STATUS)"
  fi
}

function debug_dns() {
  info "DNS resolution:"
  dig +short "$DOMAIN"
  dig +short www."$DOMAIN"
}

echo "======================================="
echo "Static Site Deep Verification"
echo "Domain: $DOMAIN (zone: $ZONE_NAME)"
echo "Fix mode: ${FIX_MODE:-off}"
echo "---------------------------------------"
echo "Checks: 1) No S3 website endpoint in DNS"
echo "        2) ACM cert in us-east-1"
echo "        3) No public bucket policy (OAC ok)"
echo "        4) Both apex + www in CloudFront"
echo "        5) DNS uses ALIAS to CloudFront"
echo "======================================="

require_tools
find_distribution
if [[ "$FIX_MODE" == "--fix-dns" ]]; then
  fix_dns_route53
  info "DNS updated. Re-run verification (without --fix-dns) after a few minutes to confirm."
fi
if [[ "$FIX_MODE" == "--fix-default-root" ]]; then
  fix_cloudfront_default_root
  info "Re-run verification after CloudFront propagates (a few minutes) to confirm HTTPS returns 200."
fi
if [[ "$FIX_MODE" == "--fix-origin" ]]; then
  fix_cloudfront_origin
  info "Re-run verification after CloudFront deploys (a few minutes). Also ensure index.html exists in s3://$BUCKET/"
fi
if [[ "$FIX_MODE" == "--fix-oac" ]]; then
  fix_cloudfront_oac
  info "Re-run verification after CloudFront deploys (a few minutes). Bucket policy already allows this distribution; HTTPS should return 200 once deployed."
fi
if [[ "$FIX_MODE" == "--fix-listbucket" ]]; then
  fix_bucket_policy_list_bucket
  info "Re-run verification to confirm ListBucket check passes."
fi
check_bucket_exists
check_bucket_has_index
check_block_public_access
check_public_policy
check_bucket_policy_matches_distribution
check_bucket_policy_list_bucket
check_cloudfront_cnames
check_cloudfront_default_root
check_cloudfront_origin
check_cloudfront_origin_oac
check_acm_cert
check_route53
debug_dns
test_https
test_s3_direct_access

echo
ok "Verification complete."

