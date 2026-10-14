# NovelNotes

A small app for logging the novels I've read: title → author → protagonists (1–2) → free-form thoughts.
Notes autosave to Supabase, so I can start writing on my phone and finish on my computer with the same account.
Any note can be exported as a typeset image with an `@ID` watermark (paginated 3:4 or a single long image, three color themes).

Plain static site (HTML + CSS + JS) — no build step, no server.

```
index.html                         Page shell
css/style.css                      Styles (follows system dark mode)
js/config.js                       ← Supabase URL and key go here
js/store.js                        Data layer (Supabase / local mode)
js/render.js                       Image layout (Canvas 2D)
js/app.js                          UI logic, autosave, multi-device sync
supabase/schema.sql                Database schema
.github/workflows/keepalive.yml    Keeps the free Supabase project from being paused
setup/                             Local helper scripts (git-ignored)
```

---

## 1. Try it locally (optional)

With `js/config.js` left empty the app runs in **local mode**: data stays in the current browser only. Handy for a quick look:

```powershell
cd D:\NovelNotes
python -m http.server 8080
```

Then open http://localhost:8080 (double-clicking `index.html` also works).

## 2. Set up Supabase (~5 minutes)

1. Sign up at https://supabase.com and create a **New project**. Pick a nearby region (e.g. `East US`) and note the database password.
2. **SQL Editor** → **New query** → paste all of `supabase/schema.sql` → **Run**. Safe to re-run.
3. Click **Connect** at the top of the project page (or **Settings → API Keys**) and copy:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **Publishable key** (`sb_publishable_...`), or the legacy **anon** key under *Legacy API Keys*
4. Put them in `js/config.js`:
   ```js
   window.NOVELNOTES_CONFIG = {
     SUPABASE_URL: 'https://xxxx.supabase.co',
     SUPABASE_ANON_KEY: 'your anon / publishable key',
   };
   ```
   This key is meant to be public. Data is protected by row-level security (RLS): each account only sees its own notes.
   **Never** use the `service_role` / `secret` key here.
5. **Authentication → Sign In / Providers → Email**:
   - Turn off **Confirm email** to log in right after signing up, or
   - keep it on, and set **Authentication → URL Configuration → Site URL** to your deployed URL (step 3), otherwise the confirmation link points to localhost.
6. After creating your own account, turn off **Allow new users to sign up** so nobody else can register with your URL.

## 3. Deploy to GitHub Pages (needed for phone access)

`D:\NovelNotes` is already a clone of `zhushangs/NovelNotes`. Double-click **`setup\publish.bat`** — it moves the keep-alive workflow into `.github\workflows\`, shows what will be committed, and pushes after you confirm.

Or manually:

```powershell
cd D:\NovelNotes
git add .
git commit -m "Update NovelNotes"
git push
```

Then in the GitHub repo: **Settings → Pages** → Source **Deploy from a branch** → Branch `main` / `(root)` → Save.
After a minute or two the site is live at `https://zhushangs.github.io/NovelNotes/`.

> The repo is public but contains only code and the public key — no notes. Notes live in Supabase behind login.

**On the phone:** open the URL in Safari / Chrome → Share → **Add to Home Screen** to use it like an app.

## 4. Keep the free Supabase project from pausing

Free Supabase projects are paused after a week without database activity (data is kept and can be restored from the dashboard).
`.github/workflows/keepalive.yml` is a GitHub Actions job that pings the database every two days to prevent this.

In the GitHub repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Name | Value |
|---|---|
| `SUPABASE_URL` | same as in `config.js` |
| `SUPABASE_ANON_KEY` | same as in `config.js` |

Then open the **Actions** tab and run *Supabase keep-alive* once manually — a green check means it's working.
(GitHub disables scheduled workflows after 60 days without commits; it emails you, and one click re-enables it.)

---

## Usage

- **New note:** the home page asks for the title, author and protagonists one at a time, then opens the editor. Press Enter to move to the next step.
- **Autosave:** saves about 1 second after you stop typing. Status is shown bottom-left (green dot = synced).
- **Continue on another device:** open the same note on another device to get the latest version. While a note is open it also pulls changes every 20 seconds and whenever you switch back to the tab.
- **Conflicts:** if two devices edit the same note at once, a dialog lets you keep both (append this device's text after the cloud version), use the cloud version, or overwrite with this device's version. Nothing is silently lost.
- **Export image:** click **生成图片** in a note. Choose 3:4 portrait (auto-paginated, labeled 1/3, 2/3…) or a long image, and a theme (宣纸 paper / 夜墨 ink / 青瓷 celadon). Download on desktop; on mobile use **分享 / 存到相册** or long-press the image.
- **Watermark:** set your watermark ID in **设置** (Settings). It's tiled diagonally as `@ID` and shown as a seal stamp at the bottom. Settings sync across devices.

## Customizing

- Image layout lives in `js/render.js`: font size `BODY_SIZE`, line height `BODY_LH`, colors `THEMES`, watermark density in `drawWatermark`.
- Adding a field (rating, tags, date read…): add a column in `schema.sql` → update `cleanPatch` / `NOTE_FIELDS` in `store.js` → add it to the editor in `app.js`.
