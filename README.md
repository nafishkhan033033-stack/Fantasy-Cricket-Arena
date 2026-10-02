# Fantasy Cricket Arena — Full-stack starter

This is a runnable Node.js web app, not a static HTML-only demo. It includes:
- Server-side account registration and login (bcrypt password hashing)
- Logout and session cookies
- SQLite database for users, wallet balance, payments and saved teams
- Fantasy XI team builder with captain/vice-captain
- Razorpay order creation and server-side signature verification for wallet top-ups
- Payment history

## Important limits
- The sample match/player names are fictional. There is no live cricket data feed or live score provider.
- Wallet top-ups are implemented as a technical integration, but actual payments will not work until you configure your own Razorpay merchant keys and activate the account.
- The checkout integration uses Razorpay Checkout. Depending on your approved merchant account, region, configuration and current provider support, checkout may offer UPI apps (such as Google Pay, PhonePe, Paytm or BHIM), cards, netbanking and supported wallets. The app does not directly connect to or independently activate each payment app.
- This starter intentionally does **not** include paid-entry contests, cash prizes, betting, or withdrawals. Real-money fantasy gaming may require legal review, state-by-state restrictions, tax handling, KYC/AML and payment-provider approval.
- Do not use real payment keys in source code or commit `.env` to GitHub.

## Run locally
Requires Node.js 20 or newer.
1. Extract the ZIP.
2. Copy `.env.example` to `.env`.
3. Set a long random `SESSION_SECRET`.
4. Leave Razorpay test placeholders until you have a Razorpay account. Login/team features work without payment keys.
5. Run `npm install`
6. Run `npm start`
7. Open `http://localhost:3000`

## Set up a merchant account and payment methods
1. Open the official Razorpay website and choose Sign up / Create account: https://razorpay.com/ .
2. Complete business/profile details and the verification steps requested by Razorpay. Approval and available payment methods depend on its review and your business type.
3. In the Dashboard, check which payment methods are enabled for your account. Do not collect or store customers' UPI PINs, OTPs, card numbers or CVVs in this app.
4. After the account is approved, open API Keys.

## Configure Razorpay test payments
1. In your Razorpay merchant account, open API Keys.
2. Generate **Test Mode** keys.
3. Put the key ID in `RAZORPAY_KEY_ID` and key secret in `RAZORPAY_KEY_SECRET` in `.env`.
4. Set `BASE_URL` to your local URL for local development. (The app does not need it for the checkout callback.)
5. Restart the server and test a small payment using Razorpay's test-mode payment details. Test-mode payments do not move real money.
6. Before live mode, complete Razorpay's merchant verification and any required approvals. Replace test keys with live keys only on a secured server and use HTTPS. Google Pay, PhonePe, Paytm, cards and other methods will only appear if supported and enabled in your checkout/account; you cannot guarantee every method will be available to every customer.

## Deployment
Deploy as a Node.js web service on a host that supports persistent storage. Set environment variables in the host dashboard:
- `NODE_ENV=production`
- `SESSION_SECRET` (long random value)
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

Important: SQLite needs persistent disk storage at `data/`. If your host uses an ephemeral filesystem, accounts and balances can disappear after redeploy/restart. Use a persistent disk or migrate to managed PostgreSQL before production. Set up HTTPS, backups, rate limiting, monitoring, CSRF protections, and a security review before launch. GitHub Pages/Cloudflare Pages static hosting alone cannot run this Node.js backend.

## Production checklist
- [ ] Persistent database with backups
- [ ] HTTPS and secure secret storage
- [ ] Rate limiting and abuse protection
- [ ] CSRF protection and session hardening
- [ ] Email verification and password reset
- [ ] Razorpay webhooks and reconciliation
- [ ] Privacy policy, terms, refund policy, support contact
- [ ] Legal review and provider approval for your intended game/payment model
