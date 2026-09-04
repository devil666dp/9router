# Docker

Run 9Router in a container. Published image: [`dipandhali2021/9router`](https://hub.docker.com/r/dipandhali2021/9router) — multi-platform `linux/amd64` + `linux/arm64`.

---

# 👤 For Users

## Quick start

```bash
docker run -d \
  -p 20128:20128 \
  -v "$HOME/.9router:/app/data" \
  -e DATA_DIR=/app/data \
  --name 9router \
  dipandhali2021/9router:latest
```

App listens on port `20128`. Open: http://localhost:20128

## Manage container

```bash
docker logs -f 9router        # view logs
docker stop 9router           # stop
docker start 9router          # start again
docker rm -f 9router          # remove
```

## Data persistence

```bash
-v "$HOME/.9router:/app/data" \
-e DATA_DIR=/app/data
```

Without `DATA_DIR`, the app falls back to `~/.9router/` (macOS/Linux) or `%APPDATA%\9router\` (Windows). In the container, `DATA_DIR=/app/data` makes the bind mount work.

Data layout under `$DATA_DIR/`:

```text
$DATA_DIR/
├── db/
│   ├── data.sqlite       # main SQLite database
│   └── backups/          # auto backups
└── ...                   # certs, logs, runtime configs
```

Host path: `$HOME/.9router/db/data.sqlite`
Container path: `/app/data/db/data.sqlite`

## Use Postgres instead of SQLite

Set `DATABASE_URL` (or `POSTGRES_URL`) and 9Router stores everything in
Postgres instead of the SQLite file. The schema is created on first start.
Without one of those two variables nothing changes — SQLite under `DATA_DIR`
stays the default.

`DB_DRIVER` selects the engine explicitly when you would rather not rely on a
URL name. `DB_DRIVER=postgres` additionally accepts vendor URL variables
(`NEON_DB_URL`, `SUPABASE_DB_URL`, `PG_URL`, `PGURL`) and fails to start if none
is set, rather than quietly using SQLite. `DB_DRIVER=sqlite` forces SQLite even
when a Postgres URL is present in the environment.

```bash
docker run -d \
  -p 20128:20128 \
  -v "$HOME/.9router:/app/data" \
  -e DATA_DIR=/app/data \
  -e DATABASE_URL="postgres://user:password@db.example.com:5432/9router?sslmode=require" \
  --name 9router \
  dipandhali2021/9router:latest
```

A URL that cannot be reached fails startup rather than falling back to SQLite —
falling back would split state across two stores. Keep the volume mounted even
on Postgres: `DATA_DIR` still holds MITM certs, logs and runtime config.

With a Postgres container in the same compose project, point at it by service
name and wait for its healthcheck:

```yaml
services:
  9router:
    image: dipandhali2021/9router:latest
    ports:
      - "20128:20128"
    volumes:
      - 9router-data:/app/data
    environment:
      DATA_DIR: /app/data
      DATABASE_URL: postgres://9router:9router@postgres:5432/9router
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: 9router
      POSTGRES_PASSWORD: 9router
      POSTGRES_DB: 9router
    volumes:
      - 9router-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U 9router"]
      interval: 5s
      retries: 10

volumes:
  9router-data:
  9router-pgdata:
```

Pool size and timeouts are tunable with `PG_POOL_MAX` (default 10),
`PG_IDLE_TIMEOUT_MS` (30000) and `PG_CONNECT_TIMEOUT_MS` (15000).

## Optional env vars

```bash
docker run -d \
  -p 20128:20128 \
  -v "$HOME/.9router:/app/data" \
  -e DATA_DIR=/app/data \
  -e PORT=20128 \
  -e HOSTNAME=0.0.0.0 \
  -e DEBUG=true \
  --name 9router \
  dipandhali2021/9router:latest
```

`DB_DRIVER` and `DATABASE_URL` / `POSTGRES_URL` switch the store to Postgres —
see [Use Postgres instead of SQLite](#use-postgres-instead-of-sqlite).

## Optional Headroom sidecar

The 9Router image does not bundle Python or Headroom. To use Headroom in Docker, run it as a separate service and point 9Router at that proxy:

```yaml
services:
  9router:
    image: dipandhali2021/9router:latest
    ports:
      - "20128:20128"
    volumes:
      - "$HOME/.9router:/app/data"
    environment:
      DATA_DIR: /app/data
      HEADROOM_URL: http://headroom:8787
    depends_on:
      - headroom

  headroom:
    image: ghcr.io/chopratejas/headroom:latest
    ports:
      - "8787:8787"
```

In the dashboard, open `Endpoint` → `Token Saver` → `Headroom`, confirm the URL is `http://headroom:8787`, recheck status, then enable Headroom.

If Headroom runs on the Docker host instead of as a sidecar, use `http://host.docker.internal:8787` on macOS/Windows. On Linux, add `--add-host=host.docker.internal:host-gateway` or the equivalent compose `extra_hosts` entry.

## Update to latest

```bash
docker pull dipandhali2021/9router:latest
docker rm -f 9router
# re-run the quick start command
```

---

# 🛠 For Developers

## Build image locally (test)

```bash
cd app && docker build -t 9router .

docker run --rm -p 20128:20128 \
  -v "$HOME/.9router:/app/data" \
  -e DATA_DIR=/app/data \
  9router
```

## Publish

Images go to two registries at once:
- `dipandhali2021/9router` on Docker Hub
- `ghcr.io/dipandhali2021/9router` on GHCR

### One-time setup

The workflow authenticates to Docker Hub with two repository secrets. Create a
[Docker Hub access token](https://hub.docker.com/settings/security) with
**Read & Write**, then:

```bash
gh secret set DOCKERHUB_USERNAME -R dipandhali2021/9router --body dipandhali2021
gh secret set DOCKERHUB_TOKEN    -R dipandhali2021/9router   # paste the token
```

GHCR needs nothing — it uses the workflow's own `GITHUB_TOKEN`.

### Release build (git tag)

```bash
node scripts/release.js "Release title" "Notes"   # recommended
# or
git tag v0.5.56 && git push origin v0.5.56
```

A `v*` tag builds amd64 + arm64 and publishes `:{version}` plus `:latest`.

### Manual build (any branch, no tag)

```bash
# tag defaults to the version in package.json
gh workflow run docker-publish.yml -R dipandhali2021/9router --ref <branch>

# explicit tag, and leave :latest where it is
gh workflow run docker-publish.yml -R dipandhali2021/9router --ref <branch> \
  -f tag=0.5.56-fal -f latest=false
```

Watch it with `gh run watch -R dipandhali2021/9router`. The run summary lists
every tag it pushed.

Workflow: `.github/workflows/docker-publish.yml`

### Build locally instead

Build from the repo root — the Dockerfile's `COPY . ./` expects that context.

```bash
docker login -u dipandhali2021

# single-arch, fastest
docker build -t dipandhali2021/9router:latest .
docker push dipandhali2021/9router:latest

# multi-arch, same as CI
docker buildx create --use --name 9router 2>/dev/null || docker buildx use 9router
docker buildx build --platform linux/amd64,linux/arm64 \
  -t "dipandhali2021/9router:$(node -p "require('./package.json').version")" \
  -t dipandhali2021/9router:latest \
  --provenance=false --sbom=false --push .
```

`.dockerignore` excludes `.env`, `data/` and `node_modules`, so no local
credentials or state end up in the published layers.
