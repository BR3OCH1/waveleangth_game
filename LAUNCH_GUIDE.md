# 🚀 Quick Launch Guide – Wavelength Game

Follow this guide to launch and play the game either **locally on your computer** or **online with friends over the internet**.

---

## 💻 Option 1: Play Locally on Your Computer

Use this option to test or play on your own machine.

### Step 1: Open two terminal windows in your project folder
```bash
z:\waveleangth_game
```

### Step 2: Start the Backend (PartyKit Server)
In **Terminal 1**, run:
```bash
npm run party
```
*(You will see: `Ready on http://127.0.0.1:1999`)*

### Step 3: Start the Frontend (Next.js App)
In **Terminal 2**, run:
```bash
npm run dev
```
*(You will see: `Ready on http://localhost:3000`)*

### Step 4: Play!
1. Open `http://localhost:3000` in **Tab 1** (e.g. Username: `Alice`, Room Code: `WAVE`).
2. Open `http://localhost:3000` in **Tab 2** (e.g. Username: `Bob`, Room Code: `WAVE`).
3. Click **🚀 Start Game**!

---

## 🌐 Option 2: Launch Online to Play with Friends Anywhere

Use this option so anyone anywhere can join from their phone, tablet, or PC!

### Your Live Backend Address (Already Deployed):
```
wavelength-game.assaf1231234.workers.dev
```

### 3-Step Vercel Launch:

1. **Open Vercel:**  
   Go to 👉 **[https://vercel.com/new](https://vercel.com/new)** and sign in with GitHub.

2. **Import Repository:**  
   Find **`waveleangth_game`** and click **Import**.

3. **Add Environment Variable:**  
   Expand **Environment Variables** and add:
   - **Key:** `NEXT_PUBLIC_PARTYKIT_HOST`
   - **Value:** `wavelength-game.assaf1231234.workers.dev`

4. **Click Deploy!**  
   Vercel will give you a public link (e.g. `https://waveleangth-game.vercel.app`).

### 🎮 Sharing with Friends:
- Send the Vercel link (`https://waveleangth-game.vercel.app`) to your friends.
- Everyone enters the **same 4-letter room code** (e.g. `GAME`) and their name.
- Click **Start Game** and enjoy real-time guessing!
