# Character Vault

A small multi-session D&D character sheet app. Node/Express backend, SQLite (via `better-sqlite3`), static frontend in `public/`.

## The model

- **Player account (your vault)** — one identity, app-wide. Your recovery code logs you into it. Your vault holds every character you own, across any sessions you're part of.
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
public/
  index.html             Join (invite code) / sign-in (recovery code)
  vault.html              Player's home: their sessions + all their characters
  session.html            One session's shared character roster + admin panel
  sheet.html               The interactive character sheet (read-only for non-owners)
  import.html              PDF import flow
  import-parser.js         Roll20 2024 sheet PDF text parser
  characters.html           Redirect stub for old bookmarks -> vault.html
  styles.css                Shared theme
dnd-app.service           systemd unit
nginx-dnd.conf.example    Reverse proxy config for dnd.matthodges.uk
.env.example
```

## How auth works — two separate codes, on purpose

It's easy to conflate these, so worth being explicit:

- **Signup code** (`SIGNUP_CODE` in `.env`) — a single, general, platform-level code. It controls whether someone can create an account on this server *at all*. It has nothing to do with any campaign.
- **Session invite code** — generated automatically by the app the moment anyone creates a session ("+ New Session" from the Vault). It controls which *campaign* an already-existing account can see. Entered only from inside the Vault, never at signup.

So the actual flow is: get the signup code from whoever runs the server → create an account (name + password, hashed with bcrypt) → you land in an empty Vault → enter a session's invite code (or create your own session) to actually get into a campaign.

This deliberately avoids the earlier design where a single code did both jobs at once — that made "how does anyone besides the first person get in" confusing, since account creation and campaign membership were tangled together.

This is intentionally lightweight for a friend group, not suitable for anything sensitive: no rate limiting on login attempts yet, and no password-reset flow if someone forgets theirs (you'd need to manually update their `password_hash` in the database, or just have them make a new account under a slightly different name).

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

- No login rate limiting
- No password-reset flow — a forgotten password currently means a new account
- No character-edit history/undo
- No way for a session admin to demote themselves or transfer admin to someone else
