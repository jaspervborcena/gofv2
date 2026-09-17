# Game of Fortunes

Game of Fortunes is an Angular app for running live, interactive raffle draws for spectators, with authentication for signed-in users.

## Features

### Before sign-in
- Visit the landing page and choose a raffle experience.
- Add players to a raffle and assign their numbers.
- Spin the raffle reels to reveal a winner.
- Use the app without signing in for quick demo or spectator use.

### After sign-in
- Sign in with Google or email.
- See a personalized welcome message using your display name or email prefix.
- Create raffles from the home page.
- Join an existing raffle using a raffle code.
- Manage raffle players, draw modes, and history.
- Run raffle draws in either:
  - Simultaneous mode
  - Per-digit mode
- Reset a raffle and review past winners.

## Raffle experience
- Create a raffle with a name and draw settings.
- Add players from a text list.
- Assign numbers automatically.
- Draw winners and preserve a history log.

## Authentication

Supported sign-in options:
- Google sign-in
- Email/password sign-in
- Email/password sign-up

## Development

### Install dependencies

```bash
npm install
```

### Start the development server

```bash
npm run start:dev
```

### Build the app

```bash
npm run build
```

### Run tests

```bash
npm run test
```
