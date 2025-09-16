#!/bin/bash
SECRET="fc8543b4d85a9eaca7239ef7f21b70deaf5a39881e05da037b9b25c7062ebbe9"
PAYLOAD='{"test": "webhook"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

echo "Testing webhook with proper signature..."
echo "Payload: $PAYLOAD"
echo "Signature: sha256=$SIGNATURE"

curl -X POST https://evalmatch.app/api/webhooks/mautic \
  -H "Content-Type: application/json" \
  -H "X-Mautic-Signature: sha256=$SIGNATURE" \
  -d "$PAYLOAD"