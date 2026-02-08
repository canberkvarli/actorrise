# Render + Vercel – "Backend unreachable" checklist

When the frontend shows **"Backend unreachable at https://actorrise-api.onrender.com/..."**, the app is calling the right host; the issue is that the **Render API service is not responding**. Use this checklist on **Render** and **Vercel** (no code changes).

---

## 1. Get the exact API URL from Render

- Open [Render Dashboard](https://dashboard.render.com) → your project → **actorrise-api**.
- At the top you’ll see the service URL, e.g.:
  - `https://actorrise-api.onrender.com` or
  - `https://actorrise-api-XXXX.onrender.com` (with a unique suffix).
- **Copy that full URL** (with `https://`).

If your URL has a **unique suffix** (e.g. `actorrise-api-abc12xyz.onrender.com`):

- In **Vercel** → Project → **Settings** → **Environment Variables**:
  - Set **`NEXT_PUBLIC_API_URL`** = that full URL (e.g. `https://actorrise-api-abc12xyz.onrender.com`).
- **Redeploy** the frontend so the new value is used.

If your URL is exactly **`https://actorrise-api.onrender.com`**, you can leave `NEXT_PUBLIC_API_URL` unset (the code default is correct).

---

## 2. Test the API in the browser

- Open: **`<your Render API URL>/health`**  
  Example: `https://actorrise-api.onrender.com/health`
- **What happens?**
  - **JSON like `{"status":"healthy"}`** → API is up; problem is likely CORS or frontend env (see step 4).
  - **Loading for 30–60 seconds then response** → Free tier cold start; wait and retry.
  - **Timeout / "can’t reach this page" / connection error** → API is down or wrong URL (see step 3).
  - **404** → Health route missing or wrong path; check backend.

---

## 3. Check Render service status and logs

In Render → **actorrise-api**:

- **Status**
  - **Live** → Service is running. If `/health` still doesn’t work, check logs and URL.
  - **Failed** → Last deploy failed. Open **Logs** and fix the error (e.g. missing env, DB connection, crash on startup).
  - **Suspended** → Free tier limit (hours, bandwidth, or no payment method). Upgrade or wait for reset; see [Render Free tier](https://render.com/docs/free).

- **Logs**
  - Look for Python/uvicorn errors, `DATABASE_URL` or DB errors, or immediate exit. Fix config or code and redeploy.

---

## 4. CORS (only if `/health` works in browser but app still fails)

- In Render → **actorrise-api** → **Environment**:
  - **`CORS_ORIGINS`** must include your frontend origin(s), e.g.:
    - `https://actorrise.vercel.app`
    - Or `https://your-production-domain.com`
  - Multiple origins: comma-separated, no spaces (e.g. `https://a.vercel.app,https://b.vercel.app`).
- Save and let the service redeploy if needed.

---

## 5. Vercel env (quick recap)

- **Vercel** → **Settings** → **Environment Variables**:
  - **Production**: Either **unset** `NEXT_PUBLIC_API_URL` (to use the code default, e.g. `https://api.actorrise.com`) or set it to your exact Render API URL.
- After changing, **redeploy** the frontend (deployments → Redeploy).

## 5b. Render backend env (cleanup)

- **Do not** set `NEXT_PUBLIC_API_URL` on the **actorrise-api** service in Render. That variable is for the **frontend** (Vercel). It has no effect on the backend and can be removed from Render → actorrise-api → Environment.

---

## 6. Free tier cold start

- Free web services **spin down** after ~15 minutes with no traffic.
- The **first request** after that can take **30–60 seconds**; the browser may timeout and show "Backend unreachable".
- **Workaround:** Open the API URL (or `/health`) in a tab, wait until it responds, then use the app. Or upgrade the Render service to a paid instance so it doesn’t spin down.

---

## Summary

| Symptom | What to do |
|--------|------------|
| URL in error is wrong (e.g. old or different host) | Set `NEXT_PUBLIC_API_URL` in Vercel to exact Render URL; redeploy. |
| `/health` times out or unreachable | Check Render status (Live/Failed/Suspended), logs, and exact URL. |
| `/health` works, app still "unreachable" | Check CORS_ORIGINS and that frontend uses same API URL. |
| First load very slow then works | Free tier cold start; wait ~1 min or upgrade. |
