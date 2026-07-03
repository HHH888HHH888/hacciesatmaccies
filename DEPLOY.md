# Deploying Haxax to haxax.com

Haxax is **one Node service**: `npm start` runs the API **and** serves the built web app
from `dist/`. The access lock (gate password → Admin / Guest sign-in) is enforced
**server-side**, and the live-data API is locked behind a valid session. That lock is only
truly secure over **HTTPS**, so the deploy must terminate TLS for haxax.com.

You need a host that runs Node (a small VPS or a platform like Render/Railway/Fly) — **not**
static hosting (Netlify/GitHub Pages), because Haxax has a live server.

---

## 0. Before you deploy — set the secrets

On the server, create `.env` (never commit it). The values you chose:

```
HAXAX_API_PORT=8787
HAXAX_GATE_PASSWORD=haxax888       # site access key
HAXAX_ADMIN_PASSWORD=haig888       # Admin sign-in
HAXAX_GUEST_PASSWORD=haxax888      # Guest sign-in
HAXAX_SESSION_SECRET=<long-random> # node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
MINIMAX_API_KEY=...                # your MiniMax key (AI notes/memos)
MINIMAX_MODEL=MiniMax-M2
MINIMAX_URL=https://api.minimax.io/v1/text/chatcompletion_v2
NODE_ENV=production                # makes session cookies Secure (HTTPS-only)
```

> Change the passwords any time by editing this file and restarting. Set a long
> `HAXAX_SESSION_SECRET` so sessions survive restarts and can't be forged.

---

## Option A — VPS + Caddy (recommended; full control, auto-HTTPS)

A $5–6/mo box (Hetzner, DigitalOcean, Lightsail) is plenty.

1. **Point DNS.** At your registrar, set an **A record**: `haxax.com → <server IP>`
   (and `www` as a CNAME → `haxax.com`). Wait for it to propagate.

2. **On the server**, install Node 20+, clone the repo, build:
   ```bash
   git clone <your repo> haxax && cd haxax
   npm install
   npm run build          # produces dist/
   # create .env as above
   ```

3. **Keep it running** with pm2 (or a systemd unit):
   ```bash
   npm i -g pm2
   pm2 start "npm start" --name haxax
   pm2 save && pm2 startup
   ```
   Haxax now listens on `127.0.0.1:8787` (API + built app).

4. **Caddy** terminates HTTPS and proxies to it. Install Caddy, then `/etc/caddy/Caddyfile`:
   ```
   haxax.com, www.haxax.com {
       reverse_proxy 127.0.0.1:8787
   }
   ```
   `sudo systemctl reload caddy`. Caddy auto-provisions a Let's Encrypt certificate.

Visit **https://haxax.com** → the gate screen. Done.

---

## Option B — Render + GoDaddy (recommended, least ops)

Haxax ships with a [`render.yaml`](render.yaml) blueprint, so the whole service is
defined in the repo.

**1. Get the code on GitHub** (Render deploys from a Git repo):
```bash
git init && git add -A && git commit -m "Haxax"
# create an EMPTY repo at github.com/new (private), then:
git remote add origin git@github.com:<you>/haxax.git
git branch -M main && git push -u origin main
```
> `.env` is git-ignored — your passwords and MiniMax key never leave your machine.

**2. Create the service on Render:**
- https://render.com → **New → Blueprint** → connect the GitHub repo.
- Render reads `render.yaml` and asks for the `sync: false` secrets — paste:
  `HAXAX_GATE_PASSWORD`, `HAXAX_ADMIN_PASSWORD`, `HAXAX_GUEST_PASSWORD`, `MINIMAX_API_KEY`.
  (Session secret is auto-generated; `NODE_ENV`, model, and URL are preset.)
- Click **Apply**. First build runs `npm install && npm run build`, then `npm start`.
- You get a live URL like `https://haxax.onrender.com`. Test the gate there first.

**3. Point haxax.com (GoDaddy) at Render:**
- In the Render service → **Settings → Custom Domains** → add `haxax.com` **and** `www.haxax.com`.
- Render shows you the DNS targets. In **GoDaddy → Domain → DNS**:
  - For the root `haxax.com`: add the record Render specifies — an **A record** to Render's
    IP, or if GoDaddy offers it, a CNAME/ALIAS to your `*.onrender.com` host.
    (GoDaddy supports a root "CNAME-like" via *Forwarding*; the A record Render gives is the
    reliable path for the apex.)
  - For `www`: add a **CNAME** → `haxax.onrender.com`.
- Back in Render, click **Verify**. Render provisions the HTTPS certificate automatically
  (a few minutes). Then **https://haxax.com** serves the gate screen. Done.

> Plan note: `render.yaml` uses **starter** so the app stays warm and the 30-minute live
> refresh keeps running. The **free** plan also works but sleeps after ~15 min idle, so the
> first visit after a nap cold-starts (~20 s) while it re-pulls the register.

---

## Security notes (read once)

- **The lock lives on the server.** Passwords are checked in Node, sessions are
  HMAC-signed http-only cookies (12 h), and `/api/data` + every data route returns
  `401` without a valid session. You cannot bypass it from the browser.
- **HTTPS is required** for the cookie `Secure` flag to engage — always run behind
  TLS (both options above do). Plain `http://` in production would send the session
  cookie in the clear.
- **This is app-grade auth**, suited to a single-operator tool: shared static
  passwords, no rate-limiting, no 2FA. If you ever expose it more widely, add:
  bcrypt-hashed passwords, login rate-limiting/lockout, and optionally 2FA.
- **Rotate** any password that's been shared in chat/email by editing `.env` and
  restarting. Keep `.env` off git (it already is).

## Accounts

| Account | Purpose                       | Starts as          |
|---------|-------------------------------|--------------------|
| Admin   | You — full control            | empty watchlist/deals |
| Guest   | Anyone else — read & analyse  | empty watchlist/deals |

Each account's watchlist/deals are stored separately in the browser, so signing in
gives a clean slate and accounts never see each other's saved work.
