#!/bin/bash
set -euo pipefail

# Handshake end-to-end smoke test script
# Exercises: sign-in → /connect/extension approve → exchange consume → sync push → sync pull → replay consume (expect 409)

# Configuration from environment or defaults
HOST="${HOST:-http://localhost:5173}"
EMAIL="${EMAIL:-admin@example.com}"
PASSWORD="${PASSWORD:-admin@8899}"

# Constants
DEV_EXT_ID="dev0000000000000000000000000000"
CALLBACK="chrome-extension://${DEV_EXT_ID}/setup-callback.html"
NONCE="$(uuidgen | tr '[:upper:]' '[:lower:]')" || NONCE="0190c7e8-f9ea-7bbc-8a3f-000000000000"

# Setup cleanup
COOKIES=$(mktemp -t handshake-cookies.XXXXXX)
trap 'rm -f "$COOKIES"' EXIT

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_FILE="$SCRIPT_DIR/fixtures/sample-push.json"

# Helper: check assertion
assert() {
  local condition="$1"
  local message="$2"
  if ! eval "$condition"; then
    echo "❌ ASSERTION FAILED: $message"
    exit 1
  fi
}

echo "=== Handshake Smoke Test ==="
echo "HOST: $HOST"
echo "EMAIL: $EMAIL"
echo ""

# Step 1: Sign in via email
echo "Step 1: Signing in with email..."
LOGIN_RESPONSE=$(curl -s -c "$COOKIES" \
  -X POST "$HOST/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

# shellcheck disable=SC2034
LOGIN_OK=$(echo "$LOGIN_RESPONSE" | jq -r '.ok // false')
assert "[ \"\$LOGIN_OK\" = \"true\" ]" "Sign-in should succeed (got: $LOGIN_RESPONSE)"
echo "✅ Sign-in successful"

# Step 2: Approve /connect/extension with session cookie, extract exchange_code
echo "Step 2: Approving extension connection..."
CONNECT_RESPONSE=$(curl -s -b "$COOKIES" -c "$COOKIES" -w "\n%{http_code}" \
  -X POST "$HOST/connect/extension" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "callback_url=$CALLBACK&nonce=$NONCE" \
  -L)

HTTP_CODE=$(echo "$CONNECT_RESPONSE" | tail -n1)
CONNECT_BODY=$(echo "$CONNECT_RESPONSE" | sed '$d')

assert "[ \"\$HTTP_CODE\" = \"200\" ]" "Connect response should be 200 (got: $HTTP_CODE)"

# Extract exchange_code from Location header (from redirect)
EXCHANGE_CODE=$(echo "$CONNECT_BODY" | jq -r '.exchangeCode // empty')
assert "[ -n \"\$EXCHANGE_CODE\" ]" "Should extract exchangeCode from response"
echo "✅ Extension approval successful, exchangeCode: $EXCHANGE_CODE"

# Step 3: Exchange code for device token
echo "Step 3: Exchanging code for device token..."
EXCHANGE_RESPONSE=$(curl -s -X POST "$HOST/api/extension/exchange/consume" \
  -H "Content-Type: application/json" \
  -d "{\"exchangeCode\": \"$EXCHANGE_CODE\"}")

DEVICE_TOKEN=$(echo "$EXCHANGE_RESPONSE" | jq -r '.deviceToken // empty')
assert "[ -n \"\$DEVICE_TOKEN\" ]" "Should extract deviceToken from exchange response"
echo "✅ Exchange successful, deviceToken: $DEVICE_TOKEN"

# Step 4: Sync push with create-workspace operation
echo "Step 4: Pushing sync operations (workspace create)..."
PUSH_RESPONSE=$(curl -s -X POST "$HOST/api/sync/push" \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "protocol-version: 1" \
  -H "extension-version: 0.0.0" \
  -d @"$FIXTURE_FILE")

APPLIED=$(echo "$PUSH_RESPONSE" | jq -r '.applied // empty')
assert "[ -n \"\$APPLIED\" ]" "Push response should contain applied field (got: $PUSH_RESPONSE)"
assert "[ \"\$(echo \"\$APPLIED\" | jq 'length')\" = \"1\" ]" "Should have exactly one applied operation"
echo "✅ Sync push successful, applied: $APPLIED"

# Step 5: Sync pull to verify operation in changelog
echo "Step 5: Pulling sync changelog..."
PULL_RESPONSE=$(curl -s -X GET "$HOST/api/sync/pull?cursor=0&limit=100" \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -H "protocol-version: 1" \
  -H "extension-version: 0.0.0")

CHANGELOG=$(echo "$PULL_RESPONSE" | jq -r '.changelog // empty')
assert "[ -n \"\$CHANGELOG\" ]" "Pull response should contain changelog (got: $PULL_RESPONSE)"
CHANGELOG_LENGTH=$(echo "$CHANGELOG" | jq 'length')
assert "[ \"\$CHANGELOG_LENGTH\" -gt 0 ]" "Changelog should have at least one entry"
echo "✅ Sync pull successful, changelog entries: $CHANGELOG_LENGTH"

# Step 6: Replay consume with same exchange code, expect 409 EXCHANGE_INVALID
echo "Step 6: Replaying exchange (expecting 409)..."
REPLAY_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$HOST/api/extension/exchange/consume" \
  -H "Content-Type: application/json" \
  -d "{\"exchangeCode\": \"$EXCHANGE_CODE\"}")

REPLAY_CODE=$(echo "$REPLAY_RESPONSE" | tail -n1)
REPLAY_BODY=$(echo "$REPLAY_RESPONSE" | sed '$d')

assert "[ \"\$REPLAY_CODE\" = \"409\" ]" "Replay should return 409 (got: $REPLAY_CODE)"
REPLAY_ERROR=$(echo "$REPLAY_BODY" | jq -r '.error // empty')
assert "[ \"\$REPLAY_ERROR\" = \"EXCHANGE_INVALID\" ]" "Error should be EXCHANGE_INVALID (got: $REPLAY_ERROR)"
echo "✅ Replay correctly rejected with 409 EXCHANGE_INVALID"

echo ""
echo "✅ All handshake smoke checks passed"
exit 0
