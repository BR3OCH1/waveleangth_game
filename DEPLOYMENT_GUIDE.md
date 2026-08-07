# Wavelength Game – Deployment & Setup Guide

This document covers how your app is currently hosted, and how to deploy both backend and frontend 100% on Cloudflare (or Vercel + Cloudflare), including custom domains.

---

## 🌐 1. Current Online Status

Your backend is **already live on the global internet** on Cloudflare Workers!

| Component | Host | Status | Public URL |
|---|---|---|---|
| **Backend (WebSockets)** | Cloudflare Workers + Durable Objects | 🟢 **LIVE ONLINE** | `https://wavelength-game.assaf1231234.workers.dev` |
| **Frontend (Web UI)** | Vercel or Cloudflare Pages | 🟢 **READY TO DEPLOY** | Local: `http://localhost:3000` |

---

## ⚡ 2. Option A: Frontend on Vercel + Backend on Cloudflare (Recommended & Easiest)

This is the standard production stack for Next.js apps.

### Step 1: Deploy Backend (Already Done!)
Your backend is deployed to `wavelength-game.assaf1231234.workers.dev`.  
To re-deploy anytime after editing code:
```bash
npm run deploy:backend
```

### Step 2: Deploy Frontend on Vercel
1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Deploy to production"
   git push origin main
   ```
2. Go to [Vercel Dashboard](https://vercel.com/new) and import your repo.
3. In **Environment Variables**, set:
   ```env
   NEXT_PUBLIC_PARTYKIT_HOST = wavelength-game.assaf1231234.workers.dev
   ```
4. Click **Deploy**. Vercel will give you a live URL like `https://wavelength-game.vercel.app`.

---

## 🟠 3. Option B: 100% Full-Stack on Cloudflare (Frontend + Backend on Cloudflare)

If you want **everything** hosted on Cloudflare without Vercel:

### Step 1: Deploy Frontend to Cloudflare Pages
1. Install `@cloudflare/next-on-pages`:
   ```bash
   npm install --save-dev @cloudflare/next-on-pages
   ```
2. Build for Cloudflare Pages:
   ```bash
   npx @cloudflare/next-on-pages
   ```
3. Deploy to Cloudflare Pages:
   ```bash
   npx wrangler pages deploy .vercel/output/static --project-name=wavelength-frontend
   ```
4. In Cloudflare Dashboard → **Workers & Pages** → **wavelength-frontend** → **Settings** → **Environment Variables**, add:
   ```env
   NEXT_PUBLIC_PARTYKIT_HOST = wavelength-game.assaf1231234.workers.dev
   ```

---

## 🏷️ 4. Adding a Custom Domain (e.g. `playwavelength.com`)

If you own a custom domain registered or pointed to Cloudflare:

1. **Backend Custom Domain** (e.g. `api.playwavelength.com`):
   - Go to Cloudflare Dashboard → **Workers & Pages** → `wavelength-game`.
   - Click **Settings** → **Triggers** → **Add Custom Domain**.
   - Type `api.playwavelength.com`.

2. **Frontend Custom Domain** (e.g. `playwavelength.com`):
   - **On Vercel:** Project Settings → Domains → Add `playwavelength.com`.
   - **On Cloudflare Pages:** Custom Domains → Add `playwavelength.com`.

3. Update your Frontend Environment Variable:
   ```env
   NEXT_PUBLIC_PARTYKIT_HOST = api.playwavelength.com
   ```

---

## 🔒 5. Security Note

If your Cloudflare API Token was shared, rotate it in the [Cloudflare Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) page, then update `CLOUDFLARE_API_TOKEN` in your local `.env.local` file.
