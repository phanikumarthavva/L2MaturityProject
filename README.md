# Enterprise Project & Resource Management (PRM)

Production-style monorepo for **project, task, and user management** with JWT authentication, role-based access control (Admin, Manager, User), and a React dashboard. It is intended as a **reference implementation** for **DevSecOps maturity between L2 and L3**: real CI/CD and security tooling, with **deliberate gaps** typical of organizations that automate builds but do not yet enforce full supply-chain or runtime security programs.

This repository **does not** contain real secrets, tokens, or passwords. Copy [`.env.example`](.env.example) to `.env` and set your own values locally or in your deployment platform.

## Architecture

```mermaid
flowchart LR
  subgraph client [Browser]
    React[React Vite]
  end
  subgraph api [Backend]
    Express[Express TypeScript]
    Auth[JWT bcrypt]
    RBAC[RBAC]
    Val[Zod]
    Sec[Helmet rate limit]
  end
  subgraph data [Data]
    Mongo[(MongoDB)]
  end
  React --> Express
  Express --> Mongo
```

- **Frontend** ([`frontend/`](frontend/)): React 19, Vite 6, Tailwind CSS 4. Uses `VITE_API_URL` when the API is on a different origin; in local dev, Vite proxies `/api` to the backend.
- **Backend** ([`backend/`](backend/)): Node.js 22 LTS, Express, TypeScript, Mongoose. REST API under `/api/v1`. Structured logging with **pino** (operational logs only; **no** audit trail product).
- **Database**: MongoDB 7 (Docker / Codespaces).

### RBAC summary

| Capability | Admin | Manager | User |
|------------|-------|---------|------|
| User directory CRUD | Yes | No | No (self profile only) |
| Projects | All | Own / member | Own / member |
| Tasks | All projects | Allowed projects | Allowed projects |

## Requirements

- **Node.js** 22+ (see [`.nvmrc`](.nvmrc))
- **npm** 10+
- **Docker** and **Docker Compose** (for containerized MongoDB + API + static UI)

## Quick start with Docker

1. Copy environment templates and set **non-default** values (especially `JWT_SECRET`):

   ```bash
   cp .env.example .env
   ```

2. Start the stack:

   ```bash
   docker compose up --build
   ```

3. Open the UI at **http://localhost:8080** and the API at **http://localhost:4000** (health: `GET http://localhost:4000/health`).

4. **Sign in:** the API creates a default **admin** on first startup (after Mongo is available). On the login page use **username `superadmin`** or **email `superadmin@prm.local`**, and password **`superadmin`**. You can still use **Register** to add normal users (`user` role). To disable the default account in production, set **`DISABLE_DEFAULT_SUPERADMIN=true`** in the environment (see [`.env.example`](.env.example)).

   Optional: `npm run seed -w backend` with `MONGO_URI`, `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD` in `.env` creates an additional admin if you need a different email.

**Compose services**: `mongo`, `api` (backend image), `web` (nginx + built SPA). The **web** container proxies **`/api/`** to the **api** service, so the browser uses **same-origin** requests (no CORS issues when using `http://localhost:8080` or `http://127.0.0.1:8080`). Leave **`VITE_API_URL` unset or empty** in `.env` for Compose (default). Rebuild the **web** image after changing it: `docker compose build web --no-cache`. API still listens on **4000** on the host for direct checks (`/health`).

## GitHub Codespaces

1. Open the repository in a **Codespace** (`.devcontainer` is provided).
2. After `postCreateCommand` (`npm install`), create a `.env` from [`.env.example`](.env.example) with `MONGO_URI=mongodb://localhost:27017/prm` (or the hostname you use), `JWT_SECRET` (≥16 characters), and `CORS_ORIGIN=http://localhost:5173`.
3. Start MongoDB (e.g. `docker compose up mongo -d` if Docker-in-Docker is enabled) or point `MONGO_URI` at MongoDB Atlas.
4. Run the API: `npm run dev -w backend`
5. Run the UI: `npm run dev -w frontend`
6. Open the forwarded port for Vite (5173).

The dev container image is **Node 22 on Debian bookworm** with **Docker-in-Docker** so `docker compose` matches local behavior.

## Local development (without full Docker stack)

```bash
npm install
# Start MongoDB locally or set MONGO_URI to a cloud instance
npm run dev -w backend
npm run dev -w frontend
```

## Environment variables

See **[`.env.example`](.env.example)** for variable **names** and short descriptions. Never commit a populated `.env`.

| Variable | Used by | Purpose |
|----------|---------|---------|
| `MONGO_URI` | API | MongoDB connection string |
| `JWT_SECRET` | API | Symmetric key for JWT signing (long random value in real environments) |
| `JWT_EXPIRES_IN` | API | JWT lifetime (e.g. `7d`) |
| `PORT` | API | Listen port (default 4000) |
| `CORS_ORIGIN` | API | Comma-separated allowed browser origins |
| `NODE_ENV` | API | `development` / `production` / `test` |
| `SEED_ADMIN` / `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | API startup (optional) | One-time admin bootstrap when enabled |
| `VITE_API_URL` | Frontend build / dev | Optional absolute API base; empty uses same origin or Vite proxy |

Frontend-only copy: [`frontend/.env.example`](frontend/.env.example).

## API overview

Base path: **`/api/v1`**

- **Auth**: `POST /auth/register`, `POST /auth/login`
- **Users**: `GET/PATCH /users/me`; Admin: `GET/POST/PATCH/DELETE /users`, `PATCH/DELETE /users/:id`
- **Projects**: `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`
- **Tasks**: `GET/POST /projects/:projectId/tasks`, `GET/PATCH/DELETE /projects/:projectId/tasks/:taskId`

Send `Authorization: Bearer <token>` for protected routes.

## Security tooling (manual)

Run from the **repository root** after `npm ci`:

```bash
# Dependency vulnerabilities (JSON report)
npm audit --json > npm-audit-report.json

# Fail only on critical count (same logic as CI)
node scripts/fail-on-critical-audit.mjs npm-audit-report.json
```

**Snyk** (requires a Snyk account and token in the environment — do not commit tokens):

```bash
npx snyk auth   # interactive, or export SNYK_TOKEN in your shell session
npx snyk test --all-projects
```

**Trivy** (image built locally as `prm-api:local`):

```bash
docker build -f backend/Dockerfile -t prm-api:local .
trivy image --severity CRITICAL,HIGH,MEDIUM,LOW --exit-code 0 prm-api:local
```

**ESLint** (backend uses `eslint-plugin-security`):

```bash
npm run lint -w backend
```

## CI/CD (GitHub Actions)

All workflows use maintained actions (`actions/checkout@v4`, `actions/setup-node@v4`, etc.).

| Workflow | File | Trigger | What it does |
|----------|------|---------|----------------|
| **CI** | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | `push`, `pull_request` | `npm ci` → **lint** (workspaces) → **test** (Vitest + MongoMemoryServer) → **typecheck** (frontend) → **build** (backend `tsc`, frontend `vite build`) |
| **Security** | [`.github/workflows/security.yml`](.github/workflows/security.yml) | `pull_request` | Publishes **`npm audit` JSON** artifact; **fails only on critical** findings via [`scripts/fail-on-critical-audit.mjs`](scripts/fail-on-critical-audit.mjs); optional **Snyk** when `SNYK_TOKEN` is configured (step uses `continue-on-error` — not fully enforced); **ESLint** with security rules and artifact upload |
| **Docker** | [`.github/workflows/docker.yml`](.github/workflows/docker.yml) | `push`, `pull_request`, `workflow_dispatch` | Builds the API image from [`backend/Dockerfile`](backend/Dockerfile); **Trivy** table + SARIF artifacts (non-blocking full scan); **separate gate fails only on CRITICAL** image findings |

This matches an **L2–L3** story: automated pipelines and real scanners exist, but **medium/low dependency issues do not fail** the main audit gate, **Snyk is optional**, and **container policy** only hard-fails on **critical** severity.

## Application security (implemented vs intentional gaps)

**Implemented:** JWT + bcrypt, RBAC, Zod validation, Helmet, rate limiting (stricter on auth routes), structured errors, CORS configuration, MongoDB access from API only.

**Intentionally not implemented** (for maturity-gap discussion): MFA, audit logging, centralized monitoring/APM, secrets scanning in CI, IaC scanning, policy-as-code engine, security KPIs dashboards.

## DevSecOps maturity (L2–L3)

**L3-style traits in this repo**

- CI runs automatically on every push and pull request with consistent stages (install, lint, test, typecheck, build).
- Multiple workflows separate **build/test**, **dependency and static analysis**, and **container image scanning**.
- Container image is built in CI and scanned with **Trivy**; results are retained as artifacts.

**L2-style / intentional gaps**

- `npm audit` **does not** fail on high/medium/low; only **critical** counts fail the security workflow gate.
- **Snyk** runs only when a token is present and does not block the workflow outcome (`continue-on-error`).
- No **secret scanning**, **IaC scanning**, or **OPA/Kyverno**-style policy enforcement in CI.
- No **metrics** export for vulnerability SLAs or pipeline DORA metrics.

Use these gaps explicitly when scoring an organization against a maturity model.

---

## Deploying with Jenkins, Docker Hub, and AWS EKS

This section is **documentation only**; adapt names, regions, and ARNs to your organization. **Do not** embed real credentials in Jenkinsfiles or Kubernetes manifests in git.

### 1. Docker Hub

1. Create repositories (e.g. `your-dockerhub-org/prm-api` and optionally `your-dockerhub-org/prm-web`).
2. On a trusted build host or Jenkins agent with Docker:

   ```bash
   docker login -u YOUR_DOCKERHUB_USER
   docker build -f backend/Dockerfile -t your-dockerhub-org/prm-api:1.0.0 .
   docker push your-dockerhub-org/prm-api:1.0.0
   ```

3. Store Docker Hub credentials in Jenkins (e.g. **Username/Password** or **Secret text** credentials) and reference them by ID in the pipeline (see snippet below).

### 2. AWS EKS (plain YAML, public HTTP port 80, no Helm, no Ingress add-on)

Concrete manifests live under [`k8s/`](k8s/) (see [`k8s/README.md`](k8s/README.md)). Summary:

1. **Create EKS + nodes** (example):

   ```bash
   eksctl create cluster --name prm-demo --region us-east-1 --nodes 2 --node-type t3.medium
   aws eks update-kubeconfig --region us-east-1 --name prm-demo
   kubectl get nodes
   ```

2. **MongoDB** must be reachable from **pod** networks (Atlas / DocumentDB / other) — not `localhost` inside the cluster.

3. **Build & push** `prm-api` and `prm-web` images to Docker Hub (same Dockerfiles as Compose). Edit image names in `k8s/04-deployment-api.yaml` and `k8s/06-deployment-web.yaml`.

4. **Secrets:** copy `k8s/01-secrets.example.yaml` to `k8s/secrets-local.yaml`, fill `mongo-uri` and `jwt-secret`, then `kubectl apply -f k8s/secrets-local.yaml` (that file is gitignored).

5. **Apply YAML** (namespace, ConfigMaps, Deployments, Services):

   ```bash
   kubectl apply -f k8s/00-namespace.yaml
   kubectl apply -f k8s/02-configmap-app.yaml
   kubectl apply -f k8s/03-configmap-nginx.yaml
   kubectl apply -f k8s/04-deployment-api.yaml
   kubectl apply -f k8s/05-service-api.yaml
   kubectl apply -f k8s/06-deployment-web.yaml
   kubectl apply -f k8s/07-service-web-loadbalancer.yaml
   ```

6. **Public URL:** run `kubectl -n prm get svc prm-web` until **EXTERNAL-NAME** (or hostname) appears. Open **`http://<hostname>`** (port **80**). AWS creates an **ELB/NLB** for `Service` `type: LoadBalancer` — this is **not** the optional **AWS Load Balancer Controller** used with `Ingress` (we do not use `Ingress` here).

7. **Traffic path:** Browser → **LoadBalancer:80** → **nginx** (`prm-web`) → **`/api` proxied** to **`prm-api` Service** (ClusterIP) on port 4000 inside the VPC.

8. **Optional:** set `cors-origin` in `k8s/02-configmap-app.yaml` to your real `http://<elb-dns>` and `kubectl rollout restart deployment/prm-api -n prm`.

### 3. Jenkins pipeline (illustrative)

Use a **Multibranch Pipeline** or **Pipeline** job with credentials bound by ID (`docker-hub`, `eks-kubeconfig`). Stages typically: checkout → `npm ci` → test → build → Docker build/push → `kubectl set image` or `kubectl apply -f k8s/`.

```groovy
pipeline {
  agent any
  environment {
    IMAGE = 'docker.io/your-dockerhub-org/prm-api'
    TAG   = "${env.BUILD_NUMBER}"
  }
  stages {
    stage('Checkout') {
      steps { checkout scm }
    }
    stage('Test and build') {
      steps {
        sh 'npm ci'
        sh 'npm test'
        sh 'npm run typecheck'
        sh 'npm run build'
      }
    }
    stage('Docker build and push') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'docker-hub',
            usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          sh 'echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin'
          sh "docker build -f backend/Dockerfile -t ${IMAGE}:${TAG} ."
          sh "docker push ${IMAGE}:${TAG}"
        }
      }
    }
    stage('Deploy to EKS') {
      steps {
        withCredentials([file(credentialsId: 'eks-kubeconfig', variable: 'KUBECONFIG')]) {
          sh "kubectl -n prm set image deployment/prm-api api=${IMAGE}:${TAG}"
        }
      }
    }
  }
}
```

For GitOps, replace the final stage with `kubectl apply -k k8s/` (or your own manifest path) from a repo commit, or trigger Argo CD / Flux to reconcile plain YAML.

## License

This reference application is provided **as-is** for education and maturity assessments. Add your own license if you fork it for product use.
