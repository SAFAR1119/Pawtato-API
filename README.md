# Pawtato API

A NestJS/MongoDB backend for a pet QR-tag digital identity and lost & found platform. An owner registers a pet, assigns it a physical QR tag, and anyone who finds a lost pet can scan the tag, see enough to help, and submit a found report — no account required.

- **Product spec:** [`PAWTATO_PROJECT_SPEC.md`](./PAWTATO_PROJECT_SPEC.md) — what to build.
- **Delivery roadmap:** [`PAWTATO_ROADMAP.md`](./PAWTATO_ROADMAP.md) — phased build plan and progress log; read this first if you're picking up ongoing work.
- **Frontend blueprint:** [`PAWTATO_FRONTEND_BLUEPRINT.md`](./PAWTATO_FRONTEND_BLUEPRINT.md) — PWA-first design brief for the companion frontend.
- **Frontend implementation docs:** [`frontend-docs/`](./frontend-docs/) — one Markdown file per feature portion, with exact request/response shapes for every endpoint needed to build that portion.

## Tech stack

- **Framework:** NestJS 11 (TypeScript), Express platform
- **Database:** MongoDB via Mongoose (`@nestjs/mongoose`)
- **Auth:** JWT (`@nestjs/jwt`, `passport-jwt`), bcrypt password hashing
- **Docs:** `@nestjs/swagger` — every endpoint and DTO is annotated
- **Other:** `helmet`, `class-validator`, `@nestjs/throttler` (rate limiting), `joi` (env validation), `nest-winston` (structured logging), `qrcode`, `@nestjs-modules/mailer`, `@nestjs/schedule` (vaccination reminders)

Modules live under `src/modules/<feature>` (controller/service/schema/dto per feature): `auth`, `users`, `pets`, `tags`, `public`, `scans`, `found-reports`, `qr`, `medical`, `vaccinations`, `notifications`, `admin`, `activity`, `health`.

## Getting started

### Prerequisites

- Node.js 22+
- MongoDB (local, Atlas, or via the bundled `docker-compose.yml`)

### Setup

```bash
npm install
cp .env.example .env   # then fill in MONGO_URI, JWT_SECRET, REFRESH_SECRET at minimum
```

Boot fails fast with a clear error if a required env var is missing or invalid (Joi validation) — see [`src/config/env.validation.ts`](./src/config/env.validation.ts) for the full schema.

| Variable | Required | Notes |
|---|---|---|
| `PORT` | no | default `5000` |
| `NODE_ENV` | no | `development` \| `test` \| `production` |
| `API_PREFIX` | no | default `api` — all routes are mounted under this |
| `APP_URL` | no | public base URL; embedded in generated QR codes |
| `CORS_ORIGINS` | no | comma-separated allow-list; empty disables CORS entirely (never a wildcard) |
| `MONGO_URI` | **yes** | |
| `JWT_SECRET` / `JWT_EXPIRES` | **yes** | access token signing |
| `REFRESH_SECRET` / `REFRESH_EXPIRES` | **yes** | refresh token signing |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASSWORD` / `MAIL_FROM` | no | email is skipped (logged, not thrown) if unset |

Only a local MongoDB is needed to run the API — start it with:

```bash
docker-compose up -d          # mongodb only
```

### Run

```bash
npm run start:dev    # watch mode
npm run start         # single run
npm run start:prod    # against dist/, after npm run build
```

Once running: API at `http://localhost:5000/api`, interactive docs at `http://localhost:5000/api/docs`.

## Docker

```bash
docker build -t pawtato-api .
# or, API + MongoDB together:
docker-compose --profile full up -d
```

`docker-compose up` (no profile) starts MongoDB only; add `--profile full` to also run the API container. The image is a non-root, multi-stage Alpine build with a `HEALTHCHECK` against `/api/health`.

## API documentation

Swagger UI is served at `/{API_PREFIX}/docs` (default `/api/docs`). Every controller and DTO carries `@ApiTags`/`@ApiOperation`/`@ApiResponse` annotations, grouped by feature (Authentication, Pets, Tags, Public, Scans, Found Reports, Medical Records, Vaccinations, Notifications, Admin, Activity, Health). Authenticated routes require a bearer JWT (`Authorize` button in the UI); public routes are explicitly marked as requiring no auth in their description.

Documenting new/changed endpoints is a hard requirement, not optional — see the "Swagger Requirement" section of every phase in `PAWTATO_ROADMAP.md`.

## Testing

```bash
npm test           # unit tests
npm run test:cov   # with coverage
npm run test:e2e   # e2e (test/)
```

Notable: [`src/app.di-check.spec.ts`](./src/app.di-check.spec.ts) compiles the *entire* real `AppModule` dependency graph (with the Mongoose connection faked out) rather than mocking module boundaries — it catches providers that are injected somewhere but never registered/imported, a class of bug that every other mocked `*.spec.ts` in this repo cannot see.

## CI/CD

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on every push/PR to `main` and `Ariyan-Dev`:

1. **`build-and-test`** — install → `lint:check` (no autofix, zero warnings tolerated) → build → unit tests.
2. **`docker-build`** — builds the production Dockerfile (no push) to catch image breakage before it reaches a deploy step, gated on `build-and-test` passing first.

## Project structure

```
src/
  common/          guards, interceptors, filters, decorators, enums shared across modules
  config/          env validation, logger config
  modules/
    auth/ users/ pets/ tags/ public/ scans/ found-reports/
    qr/ medical/ vaccinations/ notifications/ admin/ activity/ health/
  app.module.ts
  app.di-check.spec.ts   full dependency-graph regression test
  main.ts
```

## License

UNLICENSED — private project.
