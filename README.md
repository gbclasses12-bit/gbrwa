# GB STUDY — Online Study Portal

Free study batches, video lectures, PDFs, and DPPs with custom GB STUDY branding, Telegram, WhatsApp, and logo.

---

## 🚀 How to Deploy on Vercel via GitHub (100% Error-Free)

This project is completely configured with `.npmrc` (`legacy-peer-deps=true`), `vercel.json`, and `api/index.ts` so you won't encounter any `ERESOLVE` npm peer dependency errors during deployment.

### Step 1: Push code to GitHub
```bash
git init
git add .
git commit -m "Configure Vercel with legacy-peer-deps and clean dependencies"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git
git push -u origin main
```

### Step 2: Import on Vercel
1. Go to [vercel.com](https://vercel.com) and log in.
2. Click **"Add New..."** → **"Project"**.
3. Select your GitHub repository.
4. Vercel will automatically read `.npmrc` and `vercel.json`:
   - **Install Command**: `npm install --legacy-peer-deps` (Pre-configured via `vercel.json` & `.npmrc`)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Click **"Deploy"**.

---

### 🛠️ ERESOLVE Error Resolution Details
- **Root Cause**: `vite`, `@tailwindcss/vite`, and top-level `esbuild` peer dependency conflict on npm 7+.
- **Fix 1**: Added `.npmrc` with `legacy-peer-deps=true` (forces npm to ignore peer dependency strict locking).
- **Fix 2**: Configured `"installCommand": "npm install --legacy-peer-deps"` in `vercel.json`.
- **Fix 3**: Removed redundant top-level `esbuild` from `package.json` (Vite manages its internal esbuild).
