<p align="center">
  <a href="https://knucklebones.io" target="_blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="./.github/logo-dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="./.github/logo-light.svg">
      <img alt="Knucklebones" src="./.github/logo-light.svg" width="525" height="105" style="max-width: 100%;">
    </picture>
  </a>
</p>

<p align="center">
  The Knucklebones dice game in <a href="https://www.cultofthelamb.com/" target="_blank">Cult of the Lamb</a>.
</p>

---

You can find the game at [knucklebones.io](https://knucklebones.io/).

The frontend is built with: [React](https://reactjs.org/), [Vite](https://vitejs.dev/) & [Tailwind CSS](https://tailwindcss.com/).

The backend is built with: [Cloudflare Workers](https://developers.cloudflare.com/workers/) & [Durable Objects](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/)

The frontend is hosted with [Cloudflare Pages](https://developers.cloudflare.com/pages/) while the backend is a Cloudflare Worker.

All of it is written with [TypeScript](https://www.typescriptlang.org/).

## Repository structure

We use [Turborepo](https://turbo.build/) to manage our monorepo.

The `apps` directory contains the React application (`front`) and the Cloudflare Worker (`worker`) (along with the definition of the Durable Object).

The `packages` directory contains code that's shared between the React application and Cloudflare worker.

## Local development

Install dependencies, initialize the local D1 database, and start both apps:

```sh
pnpm install
pnpm db:migrate:local
pnpm dev
```

Wrangler keeps local D1 data separate from Cloudflare. Branch previews use the
shared staging Worker and staging identity database; production has separate
Worker, Durable Object, and D1 resources. Database migrations are append-only
and are applied automatically before each staging or production deployment.

`SENTRY_DSN` is an environment-scoped Worker secret. Deployment credentials
remain in the repository's GitHub Actions secrets and must never be committed.

## Legal disclaimer

The original Knucklebones game in Cult of the Lamb was created by Massive Monster. This is a fan-site and not an official implementation by Massive Monster. You can find the original game on the [Cult of the Lamb](https://www.cultofthelamb.com/) website.
