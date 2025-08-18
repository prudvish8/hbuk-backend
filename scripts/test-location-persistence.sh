#!/bin/bash
set -euo pipefail

# Configuration - CHANGE THIS to your staging backend
API="https://hbuk-backend-hvow.onrender.com"   # ← change to staging when ready
EMAIL="u$RANDOM@hbuk.dev"
PASS="test123"

echo "🔍 HBUK Location Persistence Test"
echo "=================================="
echo "API: $API"
echo "Email: $EMAIL"
echo

echo "1️⃣ Health check…"
HEALTH=$(curl -fsS "$API/health" | jq .)
echo "$HEALTH"
echo

echo "2️⃣ Version check (verify deployment)…"
VERSION=$(curl -fsS "$API/version" | jq .)
echo "$VERSION"
echo

echo "3️⃣ Register/login… (skip emails via smoke header)"
curl -fsS -X POST "$API/api/register" \
  -H 'Content-Type: application/json' -H 'X-HBUK-SMOKE: 1' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" >/dev/null || true

TOK=$(curl -fsS -X POST "$API/api/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | jq -r .token)
echo "   ✅ Token: ${TOK:0:24}…"
echo

echo "4️⃣ Commit WITH location…"
RES=$(curl -fsS -X POST "$API/api/commit" \
  -H "Authorization: Bearer $TOK" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Location test","latitude":45.5123,"longitude":-122.6789,"locationName":"Rockcreek, Oregon"}')
echo "Response:"
echo "$RES" | jq .
echo

# Check if response contains location fields
LAT=$(echo "$RES" | jq -r '.latitude // empty')
LON=$(echo "$RES" | jq -r '.longitude // empty')
NAME=$(echo "$RES" | jq -r '.locationName // empty')

if [[ -n "$LAT" && -n "$LON" ]]; then
  echo "✅ Commit response contains location ($LAT,$LON) name='$NAME'"
else
  echo "❌ Commit response is missing location fields"
  echo "   Expected: latitude, longitude, locationName"
  echo "   Got: $(echo "$RES" | jq -r 'keys | join(", ")')"
  exit 1
fi
echo

echo "5️⃣ Read entries (verify persistence)…"
E=$(curl -fsS -H "Authorization: Bearer $TOK" "$API/api/entries" | jq '.[0] // .entries[0]')
echo "First entry:"
echo "$E" | jq '{createdAt, latitude, longitude, locationName}'
echo

ELAT=$(echo "$E" | jq -r '.latitude // empty')
ELON=$(echo "$E" | jq -r '.longitude // empty')
ENAME=$(echo "$E" | jq -r '.locationName // empty')

if [[ -n "$ELAT" && -n "$ELON" ]]; then
  echo "✅ Entries include persisted location ($ELAT,$ELON) name='$ENAME'"
else
  echo "❌ Entries missing location fields"
  echo "   Expected: latitude, longitude, locationName"
  echo "   Got: $(echo "$E" | jq -r 'keys | join(", ")')"
  exit 1
fi

echo
echo "🎉 ALL TESTS PASSED ✅"
echo "Location persistence is working correctly!"
echo
echo "Next steps:"
echo "1. Test focus mode escape on frontend"
echo "2. Verify location shows after page reload"
echo "3. Merge to main when satisfied"
