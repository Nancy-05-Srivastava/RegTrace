# Deploy RegTrace on GitHub Pages (about 5 minutes, no coding)

RegTrace is a static website. It has no server, database or build step, so GitHub Pages can host it for free.

## 1. Unzip
Unzip `RegTrace-MVP.zip`. You get a folder called `RegTrace-MVP` with `index.html`, `css/`, `js/`, `assets/`, `docs/`, `tools/` and a few other files.

## 2. Create the repository
1. Sign in at https://github.com, then click **+** (top right) → **New repository**.
2. Name it `RegTrace` (or any name you like).
3. Set it to **Public**. Free GitHub Pages needs a public repository.
4. Leave "Add a README" **unticked**. Click **Create repository**.

## 3. Upload the files
1. On the new, empty repository page, click **uploading an existing file**.
2. Open the unzipped `RegTrace-MVP` folder, select **everything inside it** (not the folder itself) and drag it onto the page.
   `index.html` must end up at the top level of the repository, not inside a sub-folder.
3. Wait until every file is listed. Then click **Commit changes** at the bottom.

> Windows hides files whose names start with a dot. If `.nojekyll` doesn't upload, that's fine; the site still works.

## 4. Turn on GitHub Pages
1. In the repository, go to **Settings** → **Pages** (left menu).
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Set **Branch** to **main** and the folder to **/ (root)**. Click **Save**.
4. Wait 1–2 minutes, then refresh the page. A link appears at the top:
   `https://YOUR-USERNAME.github.io/RegTrace/`

Open the link. RegTrace loads with the 3D graph on the Overview page.

## 5. Check it works
- Click **Trace a demo RBI circular**. It should open the 3D impact graph.
- Click **Judge walkthrough** (top right) for the guided demo.
- Handy direct links (add them after the site address):
  - `?demo=rbi-xb-v1&view=graph`: opens a traced circular in 3D
  - `?tour=1`: starts the walkthrough straight away

## If something goes wrong
| Problem | Fix |
|---|---|
| 404 page | Make sure `index.html` is at the top level of the repository, not inside a `RegTrace-MVP/` folder. If it is inside the folder, either move the files up or open `.../RegTrace/RegTrace-MVP/`. |
| Blank screen or "Could not start" | The app loads its 3D library from the internet (jsDelivr). Check the connection, use Chrome or Edge, and make sure hardware acceleration / WebGL is enabled. |
| Changes don't appear | GitHub Pages can take a few minutes. Hard-refresh with Ctrl + Shift + R. |
| Pages setting says the repository must be public | Change it under Settings → General → Danger Zone → Change visibility. |

## Running it on your own computer (optional)
Opening `index.html` by double-clicking won't work, because browsers block modules on `file://`. Instead run this from inside the folder:

```
python -m http.server 8765
```

Then open http://localhost:8765
