# NairaHash Rewards

A production-oriented Bitcoin rewards platform for NGN-backed earnings and secure crypto payouts.

## Local setup

1. Copy `.env.example` to `.env`.
2. Install dependencies:
   npm install
3. Run database migration:
   npm run migrate
4. Start the API/server:
   npm start
5. Run tests:
   npm test

## Required environment variables

- `JWT_SECRET` — required for secure auth.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` — bootstrap admin account.
- `DEFAULT_BTC_TO_NGN_RATE` — default BTC to NGN conversion rate used when no live data feed is configured.
- `FLUTTERWAVE_SECRET_KEY` — required for live NGN payout requests via Flutterwave.
- `FLUTTERWAVE_PUBLIC_KEY` — recommended for frontend wallet + payout setup flows in the provider dashboard.
- `DB_PATH` — optional override for the SQLite database location.

## Production guardrails

- No demo rewards are enabled by default.
- Reward reconciliation requires verified blockchain or provider metadata.
- Admin routes are protected by JWT role checks and a required `ADMIN_EMAIL` account.
- Payout requests are only executed when valid provider credentials are configured.
