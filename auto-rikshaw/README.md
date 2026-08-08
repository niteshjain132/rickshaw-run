# Rickshaw Run

3-lane auto rickshaw dodging game. Speed ramps up the longer you survive.

**Live:** [https://rickshaw-run.vercel.app](https://rickshaw-run.vercel.app)  
**Source:** [https://github.com/niteshjain132/rickshaw-run](https://github.com/niteshjain132/rickshaw-run)

## Controls

- **Keyboard:** ← → or A / D
- **Mobile:** tap left or right half of the screen
- **Mute:** M or the 🔊 button

---

## Local (your machine)

Runs a Vite dev server on port **5555**. Only you can open it (`localhost`).

### Start

```bash
cd auto-rikshaw
npm install
npm run dev
```

Open [http://localhost:5555](http://localhost:5555).

### Stop

In the terminal where `npm run dev` is running:

```text
Ctrl+C
```

Or kill whatever is listening on port 5555:

```bash
kill $(lsof -t -i :5555)
```

### Preview a production build locally

```bash
npm run build
npm run preview
```

This serves the same kind of static files Vercel hosts, still only on your machine.

---

## Public (Vercel cloud)

The public URL does **not** use your laptop. Vercel builds the app and serves `dist/` from their CDN.

| | Local | Public |
|---|---|---|
| URL | `http://localhost:5555` | `https://rickshaw-run.vercel.app` |
| Where it runs | Your machine | Vercel cloud |
| Needs laptop on? | Yes | No |

### First-time deploy (expose to a public URL)

From `auto-rikshaw` (after [Vercel CLI](https://vercel.com/docs/cli) login):

```bash
cd auto-rikshaw
npx vercel login          # one-time; opens browser
npm run build             # optional check
npx vercel --prod         # upload + production deploy
```

Vercel prints a production URL (aliased to something like `https://rickshaw-run.vercel.app`).

**Dashboard alternative**

1. Push the repo to GitHub.
2. In [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. Set **Root Directory** to `auto-rikshaw` (if the repo contains this folder).
4. Framework: Vite · Build: `npm run build` · Output: `dist`.
5. Deploy.

### Update the public site after code changes

```bash
cd auto-rikshaw
npx vercel --prod
```

If the GitHub repo is connected in the Vercel project settings, `git push` to `main` can also trigger a rebuild.

### “Stop” the public site

There is no local process to kill. Options:

- **Unpublish / remove** the project in the Vercel dashboard (Project → Settings → delete), or
- **Pause** deployments / protect the URL under Project → Settings → Deployment Protection (blocks public access without auth).

Your machine being off does **not** take the public URL down.

---

## Useful scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server (port 5555) |
| `npm run build` | Create `dist/` for production |
| `npm run preview` | Serve `dist/` locally |
| `npx vercel --prod` | Deploy / update public production URL |
