# Character Vault

A small multi-session D&D character sheet app. Node/Express backend, SQLite (via `better-sqlite3`), Next.js UI in `web/` (with the older `public/*.html` pages as a fallback).

## The model

- **Player account (your vault)** — one identity, app-wide. Your name and password log you into it. Your vault holds every character you own, across any sessions you're part of.
- **Session** — one campaign/table (e.g. "Curse of Strahd — Tuesdays"), with its own invite code. Joining a session with its code adds you as a member — it does **not** create a new account if you already have one.
- **Character** — owned by one player, lives inside one session. Every member of that session can *view* it (read-only). Only the owner can *edit* it.
- **Session admin** — whoever creates a session. Can regenerate its invite code, remove members (deletes that member's characters *in this session only* — their account and other sessions are untouched), delete any character in the session, or delete the whole session.

A player can be a member of multiple sessions and see all their characters, grouped by session, from their vault.

## What's here

```
server.js               Express app + all API routes
db.js                    SQLite schema (users, sessions, session_members, characters)
default-template.js      Blank character template used for new characters
seed-caelric.js          One-off script: node seed-caelric.js <userId> <sessionId>
web/                     Next.js UI (themes, motion, character sheet)
public/                  Fallback static UI + SRD JSON until web/out is built
```

## How auth works — two separate codes, on purpose

It's easy to conflate these, so worth being explicit:

- **Signup code** (`SIGNUP_CODE` in `.env`) — a single, general, platform-level code. It controls whether someone can create an account on this server *at all*. It has nothing to do with any campaign.
- **Session invite code** — generated automatically by the app the moment anyone creates a session ("+ New Session" from the Vault). It controls which *campaign* an already-existing account can see. Entered only from inside the Vault, never at signup.

So the actual flow is: get the signup code from whoever runs the server → create an account (name + password, hashed with bcrypt) → you land in an empty Vault → enter a session's invite code (or create your own session) to actually get into a campaign.

This deliberately avoids the earlier design where a single code did both jobs at once — that made "how does anyone besides the first person get in" confusing, since account creation and campaign membership were tangled together.

This is intentionally lightweight for a friend group. Login and signup are rate-limited (failed attempts only). There is still no player-facing password-reset flow — a site admin can reset a password from the admin page, or you can update `password_hash` in the database. Character edits are autosaved with version history (throttled snapshots; restore is itself undoable) and optimistic concurrency via `If-Match` on saves.

## Character limits

Each player can have at most `MAX_CHARACTERS_PER_SESSION` (default 6, set in `.env`) characters within any one session. This is a hard cap enforced server-side, not just a UI suggestion.

## Local setup

```bash
npm install
cp .env.example .env
# edit .env: set SIGNUP_CODE and a generated SESSION_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm start
```

Visit `http://localhost:3000`. Sign up with your `SIGNUP_CODE`, then create your own session from the Vault — you'll be its admin automatically.

### Next.js UI (`web/`)

The vault, sheet, and related pages are a Next.js app in `web/`. It uses the existing Express API (same cookies, same `/api` routes). After `npm run build:web`, Express serves the static export from `web/out`. If that folder is missing, the older `public/*.html` pages still work.

```bash
cd web && npm install
cd .. && npm run build:web
npm start
```

During design work, run the API and Next together (Next on 3001, proxying `/api` to Express on 3000):

```bash
npm start          # terminal 1
npm run dev:web    # terminal 2 — http://localhost:3001
```

Themes: Ember Veil (default), Candlehall (light tavern), Seaglass, War Table. The character sheet has Chronicle (book pages) and At the table (large HP, slots, attacks, dice). Ambient veil motion respects `prefers-reduced-motion`. Old `*.html` bookmarks redirect to the new paths.

## Deploying to your VPS

```bash
# on your machine
scp -P 2233 -r dnd-app rocky@137.74.118.118:/tmp/

# on the server
sudo mv /tmp/dnd-app /opt/dnd-app
cd /opt/dnd-app
npm install --omit=dev
cp .env.example .env
nano .env   # set SIGNUP_CODE, SESSION_SECRET, adjust MAX_CHARACTERS_PER_SESSION if you want
```

**Run it as a service:**

```bash
sudo cp dnd-app.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dnd-app
sudo systemctl status dnd-app
```

Match the `User=` line in `dnd-app.service` to whoever should own the process — check current ownership of `/opt/dnd-app` and adjust if needed, since the service runs as that user and needs write access to create `data.sqlite`.

**Before DNS is ready**, reach it via a temporary proxy path added to your existing site's nginx config (see `nginx-dnd.conf.example` for the eventual dedicated subdomain config, or add a `location /vault/` block to your existing server instead).

**Once DNS resolves:**

```bash
sudo cp nginx-dnd.conf.example /etc/nginx/conf.d/dnd.matthodges.uk.conf
# strip the "listen 443 ssl" + commented cert lines first, get the cert, THEN they get added back:
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d dnd.matthodges.uk
```

## Importing existing characters

From a session page, "Import from PDF" reads **Roll20's 2024 character sheet PDF export** specifically (`sheet_shortname=dnd2024byroll20`) — entirely in the browser via PDF.js, nothing uploaded except the final parsed result. Other PDF sources (D&D Beyond, homebrew sheets, scanned sheets, Roll20's older 2014 template) will not parse correctly.

Not captured even on a supported sheet: spellcasting details (flagged with a warning if detected), the detailed possessions/inventory table (only the simple Equipment list), non-gold currency (only GP carries over). Add these manually after import.

## Backups

`data.sqlite` is the entire database — one file. Worth adding to whatever backup routine covers `/root/backups/` for your portfolio.

## Known limitations to revisit later

- No player-facing password reset (site admin can reset from the admin page)
- No way for a session admin to demote themselves or transfer admin to someone else
- Shared table view is live HP, AC, conditions, and a dice log for the session. There is still no initiative tracker or hidden DM rolls
- Leave-session for players (today a session admin has to remove you)

## Compendium (spell/item lookup)

`/compendium/` (or `/compendium.html`) — searchable spells and magic items, sourced from the official SRD 5.2.1 (2024 rules), released by Wizards of the Coast under CC-BY-4.0. 339 spells, 258 magic items, both with real mechanical detail (casting time, range, components, duration for spells; type, rarity, attunement for items), not just names.

**What's deliberately NOT in here, and why:** only SRD content — non-SRD subclasses, splatbook-exclusive spells/items (Xanathar's, Tasha's, etc.), and any setting/adventure lore (Curse of Strahd's own content included) are copyrighted material outside what WotC has released openly. Adding that would mean reproducing someone else's published text into a redistributable database, which doesn't become permissible by being non-commercial or staying within one group — the SRD boundary is a hard line, not a judgment call made per-use-case. Non-SRD content stays exactly where it already lived before this feature: free-text trait/gear fields you fill in yourself, in your own words, same as Caelric's Shadow Magic traits already work.

Data pulled from [your5e/5e-srd-markdown](https://github.com/your5e/5e-srd-markdown) (a faithful, CC-BY-4.0-sourced markdown conversion of the official PDF) and parsed into JSON via `scripts/build-srd-data.js`. To regenerate after an SRD update: clone that repo somewhere, run `node scripts/build-srd-data.js <path-to-cloned-repo>`, commit the regenerated `public/data/srd-*.json` files.

Required attribution is shown in the page footer, per SRD 5.2.1's CC-BY-4.0 terms.
