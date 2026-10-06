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
(`jderifaj/CLFA`): repo **Settings → Collaborators → Add people**.

## 4. Preview the `Sveltia` branch on Netlify (optional, before merging)

Netlify → **Site configuration → Build & deploy → Branches and deploy
contexts → Branch deploys → Let me add individual branches**, then add
`Sveltia`. After `git push -u origin Sveltia`, the branch builds at
`https://sveltia--<site>.netlify.app`. The CMS is at `/admin/` there.
`public/admin/config.yml` has `branch: Sveltia`, so edits made there commit
to that branch and redeploy the preview. `main` and the live site are
untouched.

## 5. Going live

1. On the `Sveltia` branch, change `branch: Sveltia` to `branch: main`
   in `public/admin/config.yml` and commit.
2. Merge `Sveltia` into `main` (a GitHub pull request, or
   `git checkout main && git merge Sveltia && git push`).
3. Netlify deploys `main` as usual. The live site's `/admin/` now edits
   and commits to `main`, and each save triggers a normal production deploy.

If Netlify deploys from a different repo or branch than
`jderifaj/CLFA` / `main`, update `backend.repo` / `backend.branch` in
`public/admin/config.yml` to match.
