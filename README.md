# 🎯 Wavelength – Real-Time Multiplayer Web Game

A modern, real-time multiplayer implementation of the party game **Wavelength**, built with Next.js, Tailwind CSS, and Cloudflare Workers (Durable Objects).

![Wavelength Multiplayer](https://img.shields.io/badge/Stack-Next.js%2016%20%7C%20TailwindCSS%20%7C%20Cloudflare%20Workers-blue)

---

## 🎮 How to Play

1. **Create/Join a Room:** Enter a 4-letter room code (e.g. `ABCD`) and your username.
2. **Roles:** One player is assigned as the **Clue Giver**; others are **Guessers**.
3. **Clue Phase:** The Clue Giver sees a secret spectrum target (0–100) on a concept pair (e.g. *Cold ↔ Hot*) and submits a single-word clue.
4. **Guessing Phase:** Guessers drag the interactive dial to guess the target position. Movement is synchronized live across all screens in real-time.
5. **Reveal Phase:** The dial is locked in, revealing the true target position and calculating points (0–100) based on accuracy.

---

## 🛠️ Tech Stack

- **Frontend:** Next.js (App Router, React 19, TypeScript)
- **Styling:** Custom CSS design system + Tailwind CSS (Glassmorphism, animated spectrum gradients)
- **Backend:** Cloudflare Workers + Durable Objects for WebSocket state management
- **Real-Time Sync:** Custom WebSocket protocol via `Partysocket` client

---

## 🚀 Quick Start (Local Development)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/your-username/wavelength-game.git
cd wavelength-game
npm install
```

### 2. Run Backend & Frontend
In separate terminal windows:

```bash
# Terminal 1: Real-time PartyKit backend (localhost:1999)
npm run party

# Terminal 2: Next.js frontend (localhost:3000)
npm run dev
```

Open `http://localhost:3000` in two browser windows to test multiplayer!

---

## 🌐 Production Deployment

See [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md) for step-by-step instructions.

- **Backend:** `npm run deploy:backend` (deploys to Cloudflare Workers)
- **Frontend:** Import repository into Vercel and set `NEXT_PUBLIC_PARTYKIT_HOST` env variable.

---

## 📁 Repository Structure

```
├── app/                  # Next.js App Router (Landing & Room pages)
├── components/           # Dial slider & UI components
├── lib/                  # Shared TypeScript types & interfaces
├── party/                # Local PartyKit dev server
├── worker/               # Native Cloudflare Worker + Durable Object server
├── scripts/              # Automated deploy scripts
├── DEPLOYMENT_GUIDE.md   # Deployment guide
└── wrangler.toml         # Cloudflare Worker configuration
```
