# Game of Fortunes Payment API

NestJS HTTP API for raffle winner events and authenticated PayPal/Maya payment order creation.

## Install and run

```bash
npm install
npm run build
npm start
```

The service exposes:

- Winner publish bridge: `POST http://localhost:3001/winners`
- PayPal order creation: `POST http://localhost:3001/payments/paypal/order`
- PayPal public client configuration: `GET http://localhost:3001/payments/paypal/config`
- PayPal order capture: `POST http://localhost:3001/payments/paypal/capture`
- Maya checkout creation: `POST http://localhost:3001/payments/maya/checkout`
- Maya payment status: `POST http://localhost:3001/payments/maya/orders/:paymentOrderId/status`
- PayPal webhook: `POST http://localhost:3001/webhooks/paypal`
- Maya webhook: `POST http://localhost:3001/webhooks/maya`

Payment endpoints require a Firebase ID token:

```http
Authorization: Bearer <firebase-id-token>
```

Copy `.env.example` to the deployment environment and configure provider secrets there. Never put provider secrets in Angular or commit a `.env` file. Firebase Admin uses Application Default Credentials on Cloud Run.

Payment request body:

```json
{
  "packageId": "basic",
  "durationMonths": 1,
  "promoCode": "optional",
  "referralCode": "optional"
}
```

The backend calculates the amount from `packageId` and `durationMonths`; client-provided prices are ignored. It stores a pending `payment_orders` document before creating the provider order.

PayPal webhooks are verified through PayPal before a matching payment order can become paid. Register `https://game-of-fortunes-payment-api-jozxtuutyq-de.a.run.app/webhooks/paypal` in the PayPal app and store its webhook ID as `PAYPAL_WEBHOOK_ID`. Maya checkout creates a unique hosted checkout URL for each order, which the app displays as a QR code. Payment status is verified by retrieving that Checkout record and matching its reference, amount, and currency before activating the subscription. Register `https://game-of-fortunes-payment-api-jozxtuutyq-de.a.run.app/webhooks/maya` for `PAYMENT_SUCCESS` notifications. Use sandbox keys with `https://pg-sandbox.paymaya.com` and production keys with `https://pg.maya.ph`.

## Winner event compatibility

The winner HTTP bridge remains available for the Angular raffle flow at the new `game-of-fortunes-payment-api` service. Native gRPC transport is no longer used.

For a direct smoke test:

```json
{
  "raffleId": "raffle-001"
}
```

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/winners -ContentType 'application/json' -Body '{"raffleId":"raffle-001","spinId":"spin-001","winnerId":"123","winnerName":"Jasper","prize":""}'
```
