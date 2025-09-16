#!/bin/bash

SECRET="fc8543b4d85a9eaca7239ef7f21b70deaf5a39881e05da037b9b25c7062ebbe9"
PAYLOAD='{"test": "webhook"}'

# Generate base64-encoded HMAC-SHA256 signature (Mautic format)
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

echo "Testing Mautic webhook with proper base64 signature..."
echo "Payload: $PAYLOAD"
echo "Signature: $SIGNATURE"

sleep 30  # Wait for deployment

curl -X POST https://evalmatch.app/api/webhooks/mautic \
  -H "Content-Type: application/json" \
  -H "Webhook-Signature: $SIGNATURE" \
  -d "$PAYLOAD" \
  -s