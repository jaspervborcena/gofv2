# Raffle gRPC service

A separate NestJS service for streaming completed raffle winners to gRPC clients such as Postman.

## Install and run

```bash
npm install
npm run build
npm start
```

The service exposes:

- gRPC: `localhost:50051`
- Winner publish bridge: `POST http://localhost:3001/winners`

## Postman

1. Create a gRPC request to `localhost:50051`.
2. Import `proto/raffle.proto` when prompted.
3. Invoke `raffle.RaffleService/SubscribeWinners`.
4. Send:

```json
{
  "raffleId": "raffle-001"
}
```

Keep the invocation open. The Angular app posts completed winners to the HTTP bridge, and the service forwards them to every subscriber for that raffle.

For a direct smoke test without Angular:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/winners -ContentType 'application/json' -Body '{"raffleId":"raffle-001","spinId":"spin-001","winnerId":"123","winnerName":"Jasper","prize":""}'
```
