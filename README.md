# Game of Fortunes

Game of Fortunes is a responsive raffle web app for creating games, managing participants, running live draws, and sharing invitations. It uses Angular, Firebase Authentication, and Cloud Firestore, with a NestJS HTTP service for payment and winner-event endpoints.

## App Features

- **Home:** Open the raffle preview, create a game, view plans, download the Android APK, or support the project with the GoTyme QR code.
- **Create a game:** Set the game name, start and close times, ticket length (3–6 characters), random or sequential numbering, draw mode, and participant instructions.
- **Raffle:** Run simultaneous or per-character draws, review raffle details and recent winners, reset a draw, and view spin availability. For saved games, the winner is selected before the animation; a transparent `3`, `2`, `1` countdown floats over the slot machine before the shared spin begins.
- **Participants:** Join with a name, manage participant lists, use the text editor, detect duplicate names, and page through participant entries. Host-entered ticket codes can contain letters and numbers, up to the configured ticket length. Numeric tickets continue to display with leading zeroes.
- **Invitations:** Share a game-specific invitation link or QR code. Invitees can enter a name, optional phone and remarks, and a custom numeric ticket number. Sign-in is required to complete joining; an invitation draft is retained while signing in. After joining, participants can open the spectator view.
- **History:** Review winners, restore winners who were excluded from the participant list, and view the recent-winner panel. The winner dialog can be dismissed without excluding the winner; exclusion is a separate action.
- **Account:** Sign in with Google or email/password, create an account, edit profile details, and view plan, monthly spins, hosted/joined games, wins, and losses. The game history tab lets users browse their games; hosts can resume their games and participants can spectate joined games.
- **Spectator view:** Joined participants can watch a game without host controls. The view includes Live Draw, My Entry, and Results tabs. When multiple games are joined, previous/next controls switch the title and all displayed game data together.
- **Plans and payments:** Compare plans and upgrade using PayPal or debit/credit card checkout. Promo and referral codes are available in the checkout dialog. Maya checkout is currently disabled in the web app and marked “Coming soon.”
- **Support:** The Donation page displays the GoTyme QR code for supporting the project.
- **Android:** The Download page provides the current Android APK when a download is available.

## Routes

| Route | Page |
| --- | --- |
| `/` | Home |
| `/about` | About Game of Fortunes |
| `/contact` | Contact and support |
| `/signin` | Sign-in and account creation |
| `/raffles` | Raffle preview |
| `/raffles/:id` | A specific raffle |
| `/games/new` | Create a game |
| `/games/:id/join` | Join through a game invitation |
| `/games/:id/spectate` | Watch a game as a joined participant |
| `/plans` | Plans and subscription checkout |
| `/premium` | Premium coming-soon page |
| `/download` | Android APK download |
| `/donation` | Project support QR code |
| `/raffle-unavailable` | Missing, unavailable, or expired raffle/invitation |

## Synchronized Spins and Spectating

For a saved raffle, clicking **Spin** selects a participant and ticket number before the animation begins. The host writes a shared `activeSpin` record to the raffle's Firestore document (`games/{gameUid}`), including a unique spin ID, the selected winner, ticket number, animation duration, and a server-generated countdown timestamp. The record stores the round start and end offsets from that server timestamp, so every client derives the same absolute start and end times. The host displays a transparent `3`, `2`, `1` overlay the same size as the slot-machine container; at zero, the animation starts and lands on the preselected ticket.

The game's scheduled start date/time does not automatically start a spin: the host must click **Spin** to begin the countdown. If a participant opens the app after a round starts, the client calculates the elapsed time from the shared start and animates only for the remaining time, landing on the preselected ticket at the same round end. The host records the round start/end timestamps with the result in raffle history and marks the active spin complete. A Firestore transaction prevents a second spin from being scheduled while an earlier spin remains in progress. This shared behavior requires Firebase/Firestore configuration; the local preview spin is not shared or persisted.

The app shell watches signed-in users' joined games while the app is open. If a joined game's spin countdown begins, it automatically navigates to that game's spectator view unless the user is already spectating a game. Participants can use the spectator game's previous/next controls to switch between joined games. The account profile's History tab also provides a game carousel and indicates which joined games have an active spin.

Spectator access requires signing in and joining the game. Spectator tabs show the live draw, the signed-in participant's own entry, and completed winners; host-only raffle management controls are not exposed. The invitation confirmation also offers a **Spectate game** link.

## Subscription Plans

Prices are monthly. PHP is the checkout currency; USD prices are also shown in the plans view.

| Plan | Price | Player limit | Spins per month |
| --- | --- | ---: | ---: |
| Free | $0 / ₱0 | 160 | 25 |
| Basic | $1.99 / ₱149 | 700 | 500 |
| Standard | $9.99 / ₱599 | 3,000 | 1,000 |
| Pro | $29.99 / ₱1,799 | 10,000 | 2,000 |

Free includes the raffle machine, history, and participant list editor. Paid plans add ad-free use and support/features as listed on the Plans page. Spin balances are tracked by billing month.

## Development

### Requirements

- Node.js and npm
- Firebase project configuration for authentication, Firestore, and the app's Firebase services

Firebase web configuration and API URLs are defined in `src/environments/environment.ts` and `src/environments/environment.prod.ts`. Local development uses the payment API at `http://localhost:3001`; production uses the configured hosted API. Do not place payment-provider secrets in the Angular app.

### Install and run the web app

```bash
npm install
npm run start:dev
```

The Angular development server defaults to `http://localhost:4200`.

### Build, test, and serve the production build

```bash
npm run build
npm test
npm start
```

`npm start` builds the app and serves the generated files with `server.js`. The server defaults to port `8080`, uses the `PORT` environment variable when provided, and exposes `/health` for health checks.

## Payment and Winner API

The NestJS HTTP API is in `raffle-grpc/` (the directory name is historical; the current service uses HTTP, not native gRPC). To run it locally:

```bash
cd raffle-grpc
npm install
npm run start:dev
```

The production workflow is `npm run build` followed by `npm start`. Configure provider credentials and Firebase Admin credentials in the backend runtime; see `raffle-grpc/.env.example`. Firebase Admin uses Application Default Credentials in Cloud Run.

Available API routes include:

- `GET /payments/paypal/config`
- `POST /payments/paypal/order`
- `POST /payments/paypal/capture`
- `POST /payments/maya/checkout`
- `POST /payments/maya/orders/:paymentOrderId/status`
- `POST /webhooks/paypal`
- `POST /webhooks/maya`
- `POST /winners`

Payment order and status routes require a Firebase ID token. The backend calculates payment amounts from the selected package and duration; it does not trust client-provided prices. Although Maya endpoints exist in the backend, the app currently disables Maya checkout.

## Android App

The Capacitor app ID is `com.gameoffortunes.app`, with web output in `dist/gofv2/browser`. The Download page links to the published APK when available.

The Android launcher icon source is `assets/icon.png`, a centered machine-mark crop from `src/assets/gofv2logo.png`. After adding or regenerating the Android platform, generate its icon and splash resources with:

```bash
npm run assets:android
```

Then rebuild the debug APK from the `android` directory with `gradlew assembleDebug` (Windows: `gradlew.bat assembleDebug`).
