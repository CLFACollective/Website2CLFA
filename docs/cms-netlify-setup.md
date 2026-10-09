# Sveltia CMS on Netlify: one-time setup

Sveltia CMS signs in with GitHub through Netlify's built-in OAuth
provider. It doesn't use Netlify Identity or Git Gateway (both are
deprecated, and Sveltia doesn't support them).

## 1. Create a GitHub OAuth app

GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**

- **Application name:** CLFA Collective CMS
- **Homepage URL:** the site's Netlify URL (e.g. `https://<site>.netlify.app`)
- **Authorization callback URL:** `https://api.netlify.com/auth/done`

Create it, then **Generate a new client secret**. Keep the Client ID and
the secret for step 2.

## 2. Give Netlify the OAuth app

Netlify → the site → **Site configuration → Access & security → OAuth →
Authentication providers → Install provider → GitHub**, then paste the
Client ID and secret.

## 3. Who can edit

Anyone who signs in must have **write** access to the GitHub repo
(`CLFACollective/Website2CLFA`): repo **Settings → Collaborators** (or
an organization team with write access).

## 4. How saves go live

`public/admin/config.yml` points the CMS at `CLFACollective/Website2CLFA`,
branch `main`. Each save in `/admin/` commits to `main`, and Netlify
rebuilds and deploys the live site from that commit (a minute or two).

If Netlify deploys from a different repo or branch, update
`backend.repo` / `backend.branch` in `public/admin/config.yml` to match.

To try edits without touching the live site, add a branch deploy
(Netlify → **Site configuration → Build & deploy → Branches and deploy
contexts → Branch deploys**) and point `backend.branch` at that branch on
it.
