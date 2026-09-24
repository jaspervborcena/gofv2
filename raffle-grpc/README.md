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
- Maya checkout creation: `POST http://localhost:3001/payments/maya/checkout`

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

Provider webhooks still need to be added before production payment activation. Payment orders must only become paid after server-side provider verification.

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
