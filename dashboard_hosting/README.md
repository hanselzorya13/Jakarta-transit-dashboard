# Putting the Jakarta Transit dashboard on the internet

This folder is a **separate copy** of your dashboard, prepared for a web host.
Nothing in your thesis folder was changed. Your local `dashboard.html` still works exactly as before.

## What is inside

```
dashboard_hosting/
├── site/                      <- THIS is the folder you upload
│   ├── index.html             the page (same content as dashboard.html)
│   ├── _headers               security settings for the host
│   ├── robots.txt
│   └── assets/                charts library, data, figures and fonts
├── make_hosting_package.py    rebuilds site/ after you update the dashboard
└── README.md                  this guide
```

What is different from `dashboard.html`: the one big 11 MB file was split into
smaller pieces (page, data, chart library, figure images, fonts). It looks and
works the same, but it opens faster, and browsers remember the big pieces so
the second visit is almost instant. The fonts are now included, so visitors'
browsers never contact Google or any other outside server.

## Option A (recommended): Cloudflare Pages, drag and drop, no git needed

Free, fast in Indonesia, and it reads the `_headers` security file.

1. Unzip `dashboard_hosting.zip` somewhere on your computer.
2. Create a free account at https://dash.cloudflare.com/sign-up
3. In the left menu open **Workers & Pages**, click **Create**, choose the
   **Pages** tab, then **Upload assets** (sometimes called "Drag and drop your files").
4. Give the project a name, for example `jakarta-transit`. This becomes the web
   address: `https://jakarta-transit.pages.dev`
5. Drag the **`site`** folder (not the zip, not `dashboard_hosting`) into the box
   and click **Deploy site**.
6. Open the link it shows. Done. Send that link to anyone.

To update later: in the same project click **Create deployment** (or "Upload
new version") and drag the new `site` folder in again.

## Option B: Netlify, also drag and drop

1. Create a free account at https://app.netlify.com/signup
2. Go to **Sites** and drag the **`site`** folder onto the area that says
   "drag and drop your site output folder here".
   (Log in first. Sites dropped without an account are deleted after an hour.)
3. Under **Site configuration > Change site name** pick a nicer name, e.g.
   `jakarta-transit` gives `https://jakarta-transit.netlify.app`.

To update: open the site, go to **Deploys**, and drag the new `site` folder in.

## Option C: GitHub Pages (only if you are comfortable with git)

GitHub Pages does not read the `_headers` file, but the most important rule
(the Content-Security-Policy) is also inside `index.html`, so it is still protected.
Note: on a free GitHub account, Pages only works for a **public** repository,
so everyone could see all your code and data files. If your thesis repo is private
and you want to keep it that way, use Option A or B instead.

1. On GitHub create a new **public** repository, e.g. `jakarta-transit-dashboard`.
2. Click **Add file > Upload files**, drag in everything that is *inside* `site`
   (index.html, _headers, robots.txt and the assets folder), then **Commit changes**.
3. Open **Settings > Pages**, under "Branch" pick `main` and `/ (root)`, click **Save**.
4. After a minute the address appears at the top of that page:
   `https://<your-username>.github.io/jakarta-transit-dashboard/`

## What "security" this package gives you

- **Static only.** There is no server code, database, login or form, so there is
  nothing for an attacker to break into or steal. The host just hands out files.
- **No secrets.** The package contains only the public data.go.id ridership data,
  your results and figures. No passwords, keys or personal files.
- **Content-Security-Policy.** The browser is told to run only scripts that come
  from your own site and to block everything else (injected scripts, other
  websites' code, plugins, forms sending data elsewhere).
- **No outside requests.** Fonts, charts and images are all served from your own
  site, so visitors are not tracked by third parties.
- **Anti-clickjacking.** Other websites cannot embed your dashboard in a hidden
  frame (`frame-ancestors 'none'`, `X-Frame-Options: DENY`).
- **HTTPS everywhere.** All three hosts give you a free HTTPS certificate
  automatically; `Strict-Transport-Security` keeps browsers on HTTPS.

The dashboard stores only the visitor's own tab and filter choices in their
browser (localStorage). Nothing is sent anywhere.

## Optional: make it private (only people you allow can open it)

Only do this if you do not want the dashboard to be fully public, for example
before your defence.

- **Cloudflare Pages + Cloudflare Access (free for up to 50 people):** in your
  Pages project open **Settings > General > Access policy > Enable**. Then, in
  **Zero Trust > Access > Applications**, edit the policy to allow specific
  email addresses (e.g. your supervisor's). Visitors type their email and get a
  one-time code. No passwords to share.
- **Netlify:** password protection needs a paid plan, so Cloudflare Access is the
  free way.

## After you change the dashboard

When you rebuild your dashboard with `python build_dashboard.py`, refresh this
hosting copy too:

```
cd dashboard_hosting
python make_hosting_package.py "PATH/TO/thesis/dashboard/dashboard.html"
```

It only reads your `dashboard.html` and rewrites the `site` folder here. Then
upload the new `site` folder as described above.

## Check it before uploading (optional)

Double-clicking `site/index.html` usually works. To preview it exactly like a real website:

```
cd dashboard_hosting/site
python -m http.server 8000
```

Then open http://localhost:8000 in your browser (press Ctrl+C to stop).
