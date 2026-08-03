# CollabEditor — AWS Production Deployment Plan

Full-stack AWS plan for the collaborative code editor (Express 5 + Socket.IO/Yjs + React/Vite + MongoDB + Redis/BullMQ + Docker sandboxes + LiveKit + Groq AI), built with Terraform and deployed via a Jenkins CI/CD pipeline with ECR, ECS-EC2, ALB/NLB, EFS, ElastiCache, and Secrets Manager.

> Status: **PLAN (pre-implementation).** Nothing in `deploy/` exists yet. Part A is a verified audit of the current repo; Parts B–M are the target design.

---

## Part A — Deployment Readiness Audit (verified against this repo)

Legend: ✅ Ready · ⚠️ Needs change before prod · 🔴 Blocker

### A.1 What is already deployment-ready

| Area | Status | Evidence / notes |
|---|---|---|
| Frontend builds to static `dist` | ✅ | `vite build` (CI job `frontend` builds it). Dockerfile is multi-stage: builds frontend, copies `Frontend/dist` → `Backend/public`, backend serves it (`express.static("public")`, server.js:406) |
| Single-container deploy possible | ✅ | Root `dockerfile` → `node server.js`; everything same-origin in prod (relative `/api`, `/socket.io`, `/auth`) — no CORS pain |
| Health endpoint | ✅ | `GET /health` (server.js:402) — ready for ALB target-group checks |
| Cookie auth for prod | ✅ | `httpOnly` + `sameSite:lax`, `secure` toggles on `NODE_ENV=production` (middleware/auth.js:145–148) |
| AI assistant (all 4 phases) | ✅ | Fully implemented; all env vars documented in `Backend/.env.example` |
| CI already exists | ✅ | `.github/workflows/ci.yml` (build + lint + syntax), `.github/workflows/docker.yml` (builds multi-arch to GHCR) |
| Config is env-driven | ✅ | `dotenv/config`, everything read from `process.env` (`MONGODB_URI`, `REDIS_URL`, `UPSTASH_REDIS_URL`, `CLIENT_URL`, `PORT`) |
| Sandbox images defined | ✅ | `Backend/sandbox/Dockerfile` (`sandbox-runner`) and `terminal.Dockerfile` (`opencode-terminal`) — must be built+pushed to ECR |

### A.2 Blockers and must-fix items

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | 🔴 | **No SPA fallback.** `server.js` only does `app.use(express.static("public"))`. React Router uses `BrowserRouter` (App.jsx:62), so refreshing `/editor/:roomId` (or any deep link) returns 404. | Add a catch-all that serves `index.html` for non-API/`/socket.io`/`/health` routes (see Part N, Fix 1). |
| 2 | 🔴 | **Docker socket required for sandbox/terminal.** `sandboxRunner.js` and `terminalManager.js` use `dockerode` against `/var/run/docker.sock`. Without it code execution silently falls back to `child_process` (**NOT sandboxed**). | Run the API on **ECS-EC2** (not Fargate) with the Docker socket available; push `sandbox-runner` / `opencode-terminal` to ECR and ensure the host has them tagged `:latest` (Part G). |
| 3 | 🔴 | **In-memory, single-instance state.** Live Yjs docs (`ySocketIO.documents`), `roomMembers`, `socketTerminals`, AI `pendingEdits`, `symbolIndex.roomIndexes`, `retrievalService.roomVectors` all live in the API process. Two API instances behind a load balancer = split-brain collaboration. | MVP: run **exactly one API task** (autoscale the *EC2 host* only via ECS EC2 capacity, or scale 1). Document the constraint; Phase 2 option = per-room pinning + sticky sessions, or move shared state to Redis/EFS (Part L.3). |
| 4 | 🔴 | **BullMQ needs Redis at boot.** `execQueue.js` creates `Queue` + `Worker` (concurrency 5) at startup (`createWorker` in server.js:55). No Redis ⇒ queue never connects. | Provision ElastiCache Redis as mandatory (Part I). Optional hardening: lazy-init the worker. |
| 5 | ⚠️ | **Terminal bind-path mismatch under Docker-in-Docker.** `terminalManager.js:217` binds `${projectDir}:/workspace` using the path *inside the API container* (`/tmp/opencode-projects/<id>`). Via the host socket this resolves on the **host**, not the container. `putArchive` still injects files, so terminals mostly work — but the bind is empty/misleading. | Mount **EFS at `/tmp/opencode-projects`** at the same path on the host and in the container (Part I), or drop the bind and rely on `putArchive`. |
| 6 | ⚠️ | **Project disk is ephemeral.** `PROJECTS_DIR = /tmp/opencode-projects` (projectSync.js:8). Lost on restart/redeploy — git repos and disk mirrors vanish. | EFS mount (Part I). |
| 7 | ⚠️ | **Secrets baked into the image.** Dockerfile declares `ARG`/`ENV` for `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET` — they end up in image layers (readable via `docker history`), and the GHCR workflow (`docker.yml`) passes them as `build-args`. | Remove secret ARG/ENV from the Dockerfile; pass everything via runtime env / Secrets Manager (Part N, Fix 2). |
| 8 | ⚠️ | **No `NODE_ENV` anywhere in image/env docs.** Needed for secure cookies, and good practice for Express. | Set `NODE_ENV=production` in ECS task env + `.env.example`. |
| 9 | ⚠️ | **`.env` is not bundled** — `dotenv/config` reads `/app/.env`, which doesn't exist in the image. Everything must come from real env vars. That's fine (12-factor), but the plan must enumerate every var (Part D). | See Part D. |
| 10 | ⚠️ | **LiveKit is dev-configured.** `livekit.yaml`: hardcoded `devkey`/dev secret, `use_external_ip: false`, `turn.enabled: false`, UDP 50000–50100. Users behind NAT won't get media. | Prod keys, `use_external_ip: true`, TURN enabled (or LiveKit Cloud), NLB/host networking for UDP (Part H). |
| 11 | ⚠️ | **Stale committed frontend build** in `Backend/public/` (4 files, e.g. `index-CXBczqiJ.js`). Docker rebuild overwrites it, but running backend directly would serve stale assets. | Remove `Backend/public` from git (or add to `.gitignore`) and rely on the image build (Part N, Fix 3). |
| 12 | ⚠️ | **`prestart`/`predev` = `pkill -9 -f 'node server.js'`** (Backend/package.json). Kills *any* matching process on the host. Harmless in the container (CMD runs `node server.js` directly), dangerous if someone runs `npm start` on a shared EC2 host. | Run `node server.js` directly in task/systemd; never `npm start` on shared hosts. |
| 13 | ⚠️ | **OAuth redirect URIs.** Google/GitHub consoles still point at dev URLs; `CLIENT_URL` must equal the prod origin. | Update consoles + set `CLIENT_URL` (Part J). |
| 14 | ⚠️ | **Secrets hygiene in repo.** `atlas-credentials.env` exists on disk (gitignored — good). `Work.txt` (tracked) contains a session token; `aws-setup.pdf` is tracked (fine). | Remove `Work.txt` token; consider `git filter-repo` if secrets ever landed in history. |
| 15 | ⚠️ | **No tests.** Backend `"test"` script is a stub; there is no frontend test script. | Add smoke tests in CI (boot server + `/health`, login flow) (Part F). |
| 16 | ⚠️ | **Express 5 behind a proxy.** No `app.set("trust proxy", …)`. | Add `trust proxy` (ALB) for correct `req.ip`/`req.protocol` (Part N, Fix 4). |

### A.3 External dependencies (must exist before go-live)

| Service | Required by | Where to get it |
|---|---|---|
| MongoDB (Mongoose 9) | Core DB (users, projects, comments, executions) | **MongoDB Atlas** (already have `atlas-credentials.env`) or self-host. *Do NOT use DocumentDB without testing — Mongoose 9/Atlas-specific features may not be compatible.* |
| Redis | BullMQ code-exec queue, AI rate limiting | ElastiCache Redis (or Upstash) |
| Groq API key | AI chat/agent | `GROQ_API_KEY` |
| SMTP | Email invitations (`mailer.js`) | SES SMTP or Gmail app password |
| Google / GitHub OAuth | Login | Google Cloud Console / GitHub OAuth apps |
| LiveKit | WebRTC AV | Self-hosted (Part H) or LiveKit Cloud |
| Docker engine + socket | Code sandbox + terminal | ECS-EC2 host |

---

## Part B — Target Architecture

```
                          ┌────────────────────────────────────────────────┐
                          │                  AWS Cloud                     │
   ┌───────────┐   HTTPS/WS│  ┌────────────────────┐    ┌──────────────┐   │
   │  Route 53 │──────────►│  │  CloudFront (opt)  │──►│    ALB       │   │
   │ app.example.com │     │  └────────────────────┘    │  :80/:443    │   │
   └───────────┘           │        ┌───────────────────┤  TLS (ACM)   │   │
                          │        │                   └──────┬───────┘   │
                          │   ┌────▼──────────────────────────┴───────┐   │
                          │   │  ECS Cluster (EC2 launch type)        │   │
                          │   │  ┌──────────────────────────────────┐ │   │
                          │   │  │  api service (×1 task)           │ │   │
                          │   │  │  image: ECR/collab-api           │ │   │
                          │   │  │  mounts: /var/run/docker.sock    │ │   │
                          │   │  │          EFS:/tmp/opencode-projects│   │
                          │   │  │  env: Secrets Manager + SSM       │ │   │
                          │   │  └──────────────────────────────────┘ │   │
                          │   │  (ECS-EC2 host runs Docker →          │   │
                          │   │   spawns sandbox-runner /             │   │
                          │   │   opencode-terminal containers)       │   │
                          │   └───────────────────────────────────────┘   │
                          │   ┌─────────────┐  TCP+UDP        ┌────────┐  │
                          │   │    NLB      │◄───────────────►│ LiveKit│  │
                          │   │ 7880/7881/  │                 │ server │  │
                          │   │ 50000-50100 │                 └────────┘  │
                          │   └─────────────┘                             │
                          │   ┌───────────────┐  ┌───────────────┐        │
                          │   │ ElastiCache   │  │ EFS (shared)  │        │
                          │   │ Redis (queue, │  │ /tmp/opencode-│        │
                          │   │ rate limit)   │  │ projects      │        │
                          │   └───────────────┘  └───────────────┘        │
                          │   ┌───────────────┐  ┌──────────────────┐      │
                          │   │ MongoDB Atlas │  │  Jenkins (EC2)   │      │
                          │   │ (external,    │  │  CI/CD: build →  │      │
                          │   │ TLS)          │  │  ECR → Terraform │      │
                          │   └───────────────┘  │  → ECS deploy    │      │
                          │                      └──────────────────┘      │
                          │   Observability: CloudWatch Logs/Alarms · SNS · │
                          │   X-Ray(opt) · WAF(opt) · GuardDuty(opt)        │
                          └────────────────────────────────────────────────┘
```

**Routing summary**
- `app.example.com` → ALB → ECS **api** task. Handles HTTP API, SSE, and Socket.IO (WS). ALB supports WS via `websocket` target-group protocol.
- `livekit.example.com` → **NLB** (TCP 7880/7881 + UDP 50000–50100) → LiveKit server. (ALB can't do raw UDP ranges; NLB or host networking is required.)
- SSE from `/api/ai/*` flows through the same ALB → api task (plain HTTP streaming, no special config).
- **Single API task** for MVP (Part A blocker #3). The ALB still adds TLS termination, health checks, and WS support; it does not load-balance a second API instance until the state problem is solved.

---

## Part C — AWS Service Inventory

| Category | Service | Purpose |
|---|---|---|
| Compute | **ECS on EC2** (capacity provider + ASG) | API + ability to mount Docker socket for sandbox/terminal (Fargate is disqualified by blocker #2) |
| Compute | **EC2** | Jenkins instance (or ECS-run Jenkins), optional bastion |
| Container registry | **ECR** ×3 | `collab-api`, `collab-sandbox-runner`, `collab-opencode-terminal` |
| Networking | **VPC** (2 AZs), public/private subnets, IGW, NAT GW | Isolated network |
| Load balancing | **ALB** | HTTP/HTTPS/WS for app + API |
| Load balancing | **NLB** | LiveKit TCP/UDP |
| DNS / TLS | **Route 53** + **ACM** | `app.example.com`, `livekit.example.com`, managed certs |
| Storage | **EFS** | `/tmp/opencode-projects` shared project disk (git repos, disk mirror) |
| Cache / queue | **ElastiCache Redis** | BullMQ code-exec queue, AI rate limiting (blocker #4) |
| Database | **MongoDB Atlas** (external) | Primary DB (preferred over DocumentDB for Mongoose 9 compat) |
| Secrets | **Secrets Manager** / **SSM Parameter Store** | All env secrets; injected into task at runtime (blocker #7) |
| CI/CD | **Jenkins on EC2** | Pipeline: checkout → build → test → push ECR → terraform → ECS update |
| IaC | **Terraform** (state in S3 + DynamoDB lock) | All infra as code |
| Observability | **CloudWatch** Logs/Alarms, **SNS** | Logs, health alarms, notification |
| Security | **IAM**, **KMS**, **Security Groups**, optional **WAF/GuardDuty/Security Hub** | Least-privilege, encryption, edge protection |
| Serverless (optional) | **S3** | Terraform state, Jenkins artifacts/backups; optionally split static hosting |
| Edge (optional) | **CloudFront** | Static asset caching in front of ALB; second place to run WAF |

Deliberately **not** used for MVP: EKS (overkill; ECS-EC2 is simpler), Fargate (no Docker socket), Lambda (stateful long-running app), RDS (not the DB engine).

---

## Part D — Environment & Secrets Matrix

All secrets live in **Secrets Manager** (key `collab/prod/env`), injected into the ECS task as env vars. Non-secrets in the task definition or SSM. **Never** bake into image (fix #7).

| Variable | Source | Example (prod) |
|---|---|---|
| `NODE_ENV` | task def | `production` |
| `PORT` | task def | `3000` |
| `CLIENT_URL` | task def | `https://app.example.com` |
| `MONGODB_URI` | secret | `mongodb+srv://…` |
| `JWT_SECRET` | secret | 64+ random bytes |
| `GOOGLE_CLIENT_ID/SECRET` | secret | from Google console |
| `GITHUB_CLIENT_ID/SECRET` | secret | from GitHub OAuth app |
| `LIVEKIT_API_KEY/SECRET` | secret | generated for prod LiveKit |
| `LIVEKIT_URL` | task def | `http://livekit:7880` (or NLB DNS) |
| `LIVEKIT_WS_URL` | task def | `wss://livekit.example.com` |
| `REDIS_URL` | secret | `rediss://<elasticache>…` (enable TLS in-transit) |
| `EMAIL_HOST/PORT/USER/PASS` | secret | SES SMTP `email-smtp.*.amazonaws.com:587` |
| `GROQ_API_KEY` | secret | Groq console |
| `GROQ_MODEL`, `GROQ_MAX_TOKENS`, `AI_MAX_INPUT_TOKENS`, `AI_RATE_LIMIT`, `AI_RETRIEVAL_TOKENS`, `AI_AGENT_MAX_TURNS` | task def / SSM | per `.env.example` defaults |
| `EMBEDDING_PROVIDER` | task def | `local` (or `openai` + key) |

> Note on local embeddings (`@xenova/transformers`, ~20–40 MB model): the model downloads from Hugging Face on first embed. Pre-warm in the Dockerfile or run one `/api/ai/:roomId/search` on deploy, and add the model dir to the image so it doesn't re-download per task/restart.

---

## Part E — Terraform Layout (IaC)

State: **S3 bucket** `terraform-state-<acct>` + **DynamoDB** table `terraform-lock` (encrypted, versioned). Backend config in `deploy/terraform/backend.tf`.

```
deploy/terraform/
├── backend.tf                # S3 + DynamoDB locking
├── providers.tf              # aws, tls, random
├── versions.tf
├── main.tf                   # module wiring, tags, locals
├── vars.tf / outputs.tf
├── modules/
│   ├── network/              # VPC, 2 AZs, public/private subnets, IGW, NAT, SGs
│   ├── ecr/                  # 3 repos (api, sandbox-runner, opencode-terminal), lifecycle policy
│   ├── database/             # ElastiCache Redis SG+cluster, (Atlas is external)
│   ├── storage/              # EFS fs + access point + mount targets
│   ├── livekit/              # NLB, SG, UDP/TCP listeners, LiveKit service/task
│   ├── ecs/                  # ECS cluster (EC2), capacity provider, ASG, task def, api service
│   ├── alb/                  # ALB, target group, HTTPS listener, ACM, Route53 record, health checks
│   ├── jenkins/              # EC2 + SG + IAM role (ECR push, SSM, terraform apply)
│   ├── secrets/              # Secrets Manager secrets + IAM policy for task role
│   ├── observability/        # CloudWatch log groups, alarms, SNS topic
│   └── waf/ (optional)       # WAF ACL on ALB/CloudFront
└── environments/
    ├── dev/  prod.tfvars
    └── prod/ prod.tfvars     # AZs, instance types, CIDRs, domain, tags
```

Key snippets (representative):

```hcl
# modules/ecr/main.tf
resource "aws_ecr_repository" "repo" {
  for_each = toset(["collab-api", "collab-sandbox-runner", "collab-opencode-terminal"])
  name     = each.value
  image_tag_mutability = "MUTABLE"
  force_delete = false
  encryption_configuration { encryption_type = "KMS" }
  image_scanning_configuration { scan_on_push = true }
}
resource "aws_ecr_lifecycle_policy" "cleanup" {
  repository = aws_ecr_repository.repo["collab-api"].name
  policy = jsonencode({
    rules = [{ rulePriority = 1, description = "keep last 10",
      selection = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 },
      action = { type = "expire" } }]
  })
}
```

```hcl
# modules/ecs/task-def.json (api)
{
  "family": "collab-api",
  "taskRoleArn": "${task_role}",
  "executionRoleArn": "${exec_role}",
  "networkMode": "bridge",                     # or "host" for simpler docker.sock
  "requiresCompatibilities": ["EC2"],
  "cpu": 2048, "memory": 4096,
  "containerDefinitions": [{
    "name": "api",
    "image": "${repo}/collab-api:${tag}",
    "essential": true,
    "portMappings": [{ "containerPort": 3000, "hostPort": 0 }],
    "environment": [
      { "name": "NODE_ENV", "value": "production" },
      { "name": "CLIENT_URL", "value": "https://app.example.com" }
    ],
    "secrets": [
      { "name": "MONGODB_URI", "valueFrom": "arn:aws:secretsmanager:...:secret:collab/prod/env:MONGODB_URI::" },
      { "name": "JWT_SECRET", "valueFrom": "arn:aws:secretsmanager:...:secret:collab/prod/env:JWT_SECRET::" }
      # … every secret from Part D …
    ],
    "mountPoints": [{
      "sourceVolume": "project-fs", "containerPath": "/tmp/opencode-projects"
    }],
    "logConfiguration": { "logDriver": "json-file",
      "options": { "max-size": "10m", "max-file": "3" } },
    "healthCheck": {
      "command": ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""],
      "interval": 15, "timeout": 5, "retries": 5
    }
  }],
  "volumes": [{ "name": "project-fs", "efsVolumeConfiguration": {
      "fileSystemId": "${efs_id}", "rootDirectory": "/",
      "transitEncryption": "ENABLED"
  } }]
}
```

> **Docker socket inside ECS-EC2.** Because the task runs on an EC2 host with the Docker engine, mount the host socket via a bind mount. On ECS-EC2 the host `/var/run/docker.sock` path inside a container is available when you set the container path to `/var/run/docker.sock` and run the task on the same host filesystem (bridge network mode, or a `host`-mode sidecar). In bridge mode use a bind volume `{ "host": "/var/run/docker.sock", "container": "/var/run/docker.sock" }`. **This is the single most important compute decision** — it is why we use ECS-EC2 and not Fargate.
> Additional EC2-user-data bootstrap (host installs Docker, and on container-startup the sandbox images are pulled/tagged):

```bash
#!/bin/bash
# ecs-user-data (runs on each ECS-EC2 host)
# … ECS agent setup is handled by the ECS-optimized AMI …
# Ensure the sandbox images the app expects by name:tag exist on the host.
# Jenkins (or a one-shot task) pulls ECR and tags locally:
#   docker pull <acct>.dkr.ecr.<region>.amazonaws.com/collab-sandbox-runner:latest
#   docker tag <acct>.dkr.ecr.<region>.amazonaws.com/collab-sandbox-runner:latest sandbox-runner:latest
#   docker pull <acct>.dkr.ecr.<region>.amazonaws.com/collab-opencode-terminal:latest
#   docker tag <acct>.dkr.ecr.<region>.amazonaws.com/collab-opencode-terminal:latest opencode-terminal:latest
```

---

## Part F — Jenkins CI/CD Pipeline

### F.1 Jenkins layout
- **Jenkins EC2** (e.g. `t3.large`, 50 GB gp3), installed via Terraform user-data (apt install + plugins list), behind its own SG (SSH from your IP, HTTPS via SSM/ALB or direct).
- IAM role on the Jenkins instance grants: `ecr:*` push, `ssm:GetParameter`, `secretsmanager:GetSecretValue`, and `sts` for an **assume-role → terraform** role (so Jenkins never holds long-lived AWS keys).
- Credentials stored in Jenkins **credentials store** (AWS keys via the role, GitHub via a PAT or the Jenkins GitHub plugin).

### F.2 Pipeline (`Jenkinsfile`)

```groovy
pipeline {
  agent any
  environment {
    AWS_REGION = 'us-east-1'
    ECR = "${ECR_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    APP_REPO  = "${ECR}/collab-api"
    SANDBOX   = "${ECR}/collab-sandbox-runner"
    TERM      = "${ECR}/collab-opencode-terminal"
    TAG       = "${env.BRANCH_NAME}-${env.BUILD_NUMBER}"   // or git sha
  }
  stages {
    stage('Checkout') { steps { checkout scm } }

    stage('Frontend build') {
      steps { dir('Frontend') { sh 'npm ci && npm run build' } }
    }
    stage('Frontend lint') {
      steps { dir('Frontend') { sh 'npm run lint' } }
    }
    stage('Backend syntax') {
      steps { dir('Backend') { sh "find . -name '*.js' -not -path './node_modules/*' -not -path './public/*' -print0 | xargs -0 -n1 node --check" } }
    }
    stage('Smoke test') {
      steps {
        dir('Backend') {
          sh '''
            MONGODB_URI=<test-uri> JWT_SECRET=test PORT=3999 \
            REDIS_URL=<test-redis> \
            node server.js &
            sleep 4
            curl -fsS http://127.0.0.1:3999/health
            kill %1
          '''
        }
      }
    }
    stage('Build & push images') {
      steps {
        sh '''
          aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR}
          docker build -f dockerfile -t ${APP_REPO}:${TAG} .
          docker build -f Backend/sandbox/Dockerfile -t ${SANDBOX}:${TAG} Backend/sandbox
          docker build -f Backend/sandbox/terminal.Dockerfile -t ${TERM}:${TAG} Backend/sandbox
          docker push ${APP_REPO}:${TAG}
          docker push ${SANDBOX}:${TAG}
          docker push ${TERM}:${TAG}
        '''
      }
    }
    stage('Terraform plan') {
      steps {
        dir('deploy/terraform') {
          sh 'terraform init -backend-config=backend-prod.tfbackend'
          sh 'terraform plan -var-file=environments/prod/prod.tfvars -out=plan.tfplan'
        }
      }
    }
    stage('Approve') {
      input message: 'Deploy to production?', ok: 'Deploy'
    }
    stage('Terraform apply') {
      steps { dir('deploy/terraform') { sh 'terraform apply plan.tfplan' } }
    }
    stage('Rolling deploy (ECS)') {
      // force new deployment so the new TAG is picked up
      steps { sh 'aws ecs update-service --cluster collab --service api --force-new-deployment' }
    }
    stage('Verify') {
      steps { sh 'curl -fsS https://app.example.com/health' }
    }
  }
}
```

### F.3 Tag strategy
- Immutable `TAG` per build (`sha-<git>`), so ECS `image` in the task def always references a pinned tag and rollback = redeploy the previous tag.

---

## Part G — ECS (EC2) Deployment Details

| Item | Choice | Why |
|---|---|---|
| Launch type | **EC2** (capacity provider over an ASG) | Docker socket for sandbox/terminal (blocker #2); Fargate can't mount `/var/run/docker.sock` into a sibling container reliably |
| Instance | `m5.large`/`m5.xlarge`, ECS-optimized AMI, EBS gp3 100 GB | Sandbox + terminal containers spawn on the same host; give headroom |
| Networking | bridge mode; host socket bind | Simplest for dockerode |
| API replicas | **1 task** | In-memory Yjs/rooms/queues (blocker #3) |
| Autoscaling | Scale the **ASG/host** for capacity; keep `api` desiredCount=1 | Sandbox work happens on the host Docker engine |
| Health checks | ALB target on `/health`; ECS container health check | See task-def above |
| Placement | `spreadAcross` AZs (1 task anyway) | — |
| Logs | JSON driver → CloudWatch log group `collab/api` | 10m×3 rotation |

**Image references the app expects (tagged locally on host):**
- Code sandbox: `sandbox-runner:latest` (sandboxRunner.js:101)
- Terminal: `opencode-terminal:latest` (terminalManager.js:14)
Jenkins (or a start-up job) must map the ECR images to these local names on every host (F.1 user-data). Code change option: make image names configurable via env so ECR tags are used directly (Part N, Fix 5).

---

## Part H — LiveKit Networking (WebRTC)

Constraints from `livekit.yaml`: HTTP 7880, TCP 7881, UDP 50000–50100, `use_external_ip: false`, `turn.enabled: false`, dev keys.

Production requirements:
1. **Keys:** generate `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET`; set in `livekit.yaml` (mounted as a file/volume) and as the app's `LIVEKIT_API_KEY/SECRET` so `/api/livekit/token` signs with the same pair.
2. **Public address:** set `use_external_ip: true` (LiveKit auto-detects the EIP/NLB), and `rtc.tcp_port: 7881`, UDP range open.
3. **TURN:** set `turn.enabled: true` with a TLS cert (`turn.tls_port: 5349`, cert from ACM) so media works through symmetric NAT/firewalls. This is required for real-world calls, not optional.
4. **Networking:** ALB can't carry the UDP range ⇒ put LiveKit behind an **NLB**:
   - TCP 7880 (HTTP/bind) → LiveKit 7880
   - TCP 7881 (RTC) → 7881
   - UDP 50000–50100 → 50000–50100 (NLB UDP listeners)
   - `LIVEKIT_WS_URL=wss://livekit.example.com`, `LIVEKIT_URL=http://livekit.internal:7880` (server-to-server).
5. **SG:** allow 7880/7881 TCP and 50000–50100 UDP from `0.0.0.0/0` (WebRTC is peer-driven; media must reach clients). Keep 7881/UDP behind the NLB only.
6. Alternative: **LiveKit Cloud** — hosted TURN, no NLB, `LIVEKIT_WS_URL=wss://<room>.livekit.cloud`; cheapest to operate. Self-host is cheaper at high volume.

---

## Part I — Data & Storage Layer

**MongoDB Atlas**
- Existing `atlas-credentials.env` points at Atlas. Configure:
  - IP allowlist → the API's NAT-gateway egress IPs (or VPC peering for prod-grade isolation).
  - TLS + strong auth; dedicated cluster (M10+) for prod; daily backups + PITR.
- Alternatively self-host Mongo on the ECS-EC2 host or a small EC2; Atlas is recommended.

**ElastiCache Redis**
- `cache.t3.micro`/`cache.t3.small`, Redis 7, in-transit + at-rest encryption, same VPC, SG locked to the API task.
- Feeds BullMQ (`execQueue`) and `rateLimit`. Without it the code-exec queue won't connect (blocker #4).

**EFS**
- Lifecycle mode `generalPurpose`, throughput `bursting` (or provisioned if git operations spike), encrypted, mount targets in each private AZ.
- Mounted at `/tmp/opencode-projects` on the host **and** as the container volume (Part E task-def). This fixes blockers #5/#6 and makes git repos + disk mirrors durable.
- Back up via EFS-to-S3 backup plan (AWS Backup, daily).

---

## Part J — DNS, TLS, OAuth

1. **Route 53:** `app.example.com` (A/ALIAS → ALB), `livekit.example.com` (ALIAS → NLB).
2. **ACM:** public cert for both names; validate via DNS. ALB + LiveKit TURN both use it.
3. **OAuth:** set Google/GitHub redirect URI to `https://app.example.com/auth/google/callback` (and GitHub variant). Confirm the exact callback paths in `routes/auth.js`.
4. **CLIENT_URL** = `https://app.example.com`.
5. **WAF (optional):** rate-based rules + managed rules on the ALB/CloudFront to protect `/api/*`.

---

## Part K — Security Hardening Checklist

- [ ] All secrets in Secrets Manager/SSM; task roles use `kms:Decrypt` + `secretsmanager:GetSecretValue` only for needed ARNs
- [ ] Remove secret `ARG`/`ENV` from `dockerfile` (blocker #7)
- [ ] `NODE_ENV=production`, secure cookies on (already coded)
- [ ] `trust proxy` configured (blocker #16)
- [ ] `MONGODB_URI` uses `mongodb+srv://` + TLS; Atlas IP allowlist locked to NAT egress
- [ ] Redis in-transit encryption; SG to API only
- [ ] Sandbox containers: `NetworkMode: none`, mem/cpu/PID limits (already set in `sandboxRunner.js`), no volume to host except the run dir
- [ ] `/var/run/docker.sock` bind is **the** top risk — the api container can run arbitrary containers on the host. Mitigations: run the api container as non-root with a group limited to docker, or (better long-term) move sandbox execution to a dedicated worker EC2 whose only job is sandboxes, accessed via HTTP; keep the socket off the public-facing API instance
- [ ] IAM: no inline admin; per-resource policies; Jenkins uses assume-role
- [ ] WAF rate limiting on `/api/auth`, `/api/ai/*`
- [ ] CloudWatch alarms: API 5xx, target unhealthy, Redis CPU, EFS burst credits, disk > 80%, LiveKit up
- [ ] ECR `scan_on_push` enabled (done in Part E); fix critical CVEs before promote
- [ ] GuardDuty (optional) on the account
- [ ] Daily EBS/EFS backups; Mongo PITR
- [ ] `Work.txt` token removed; no secrets in git history

---

## Part L — Runbook

### L.1 Deploy
1. Push to `main` (or tag `v*`).
2. Jenkins runs Parts F.2 stages → images to ECR → `terraform apply` → `update-service --force-new-deployment`.
3. Watch CloudWatch for the new task to pass health, then ALB to route.

### L.2 Rollback
- Re-deploy previous `TAG`: `aws ecs update-service --cluster collab --service api --force-new-deployment` after pointing the task def image back to the previous tag (or `terraform apply` of the prior state).
- Mongo/EFS: restore from backup if data was damaged.

### L.3 Scaling & multi-instance roadmap (important architectural note)
The app is **not multi-instance safe today** (blocker #3). Options, in increasing effort:
1. **MVP:** 1 API task; scale the EC2 host only. Fine for small user counts; cheapest.
2. **Sticky sessions + per-room pinning:** ALB stickiness by cookie + a `room → instance` map in Redis; connect each room's clients to the same instance. Yjs/room state stays per-instance but consistent. Medium effort.
3. **Shared state out:** move `roomMembers`, AI proposals, symbol index, and vectors to Redis (interfaces already DB-agnostic per the AI design doc). Yjs docs remain the hardest — either pin per room (option 2) or accept ephemeral in-memory docs with EFS-backed snapshots.

Recommendation: **start with (1), implement (2) when you exceed a single host.**

### L.4 Day-2 ops
- Logs: `cloudwatch` group `collab/api`; add `tail -f` in Jenkins or a sidecar.
- Rotate: `JWT_SECRET` (reissue sessions), OAuth secrets, LiveKit keys.
- Capacity: watch ECS-EC2 host CPU (sandbox spawn) and EFS throughput.
- Upgrades: Node 20 LTS pin, MongoDB major, Groq model — all behind the pipeline.

---

## Part M — Rough Cost Estimate (us-east-1, monthly)

| Service | Config | ~$/mo |
|---|---|---|
| ECS-EC2 (api) | 1× `m5.large` + 100 GB gp3 | 75–85 |
| Jenkins | 1× `t3.medium` + 50 GB | 30 |
| ALB | 1 | 20 |
| NLB | 1 | 20 |
| NAT GW | 2 AZs | 65 |
| EFS | 20 GB + backup | 5–10 |
| ElastiCache | `cache.t3.micro` | 15 |
| MongoDB Atlas | M10 dedicated | 60 |
| Route 53 + ACM | | 1 |
| Data transfer | ~100 GB out | 9 |
| CloudWatch/other | logs + alarms | 5 |
| **Total** | | **~305–330/mo** |

LiveKit Cloud would add ~$100/mo (vs ~$0 self-hosted on the same host). WAF/GuardDuty/CloudFront are small-to-free at low volume.

---

## Part N — Required Code Fixes (do these before deploying)

**Fix 1 — SPA fallback** (`Backend/server.js`, after the routes, before `app.use(express.static("public"))` or right after it):
```js
import path from "path"
import { fileURLToPath } from "url"
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.get(/^\/(?!api\/|auth\/|socket\.io|health).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})
```
(or add a tiny middleware after static that sends `index.html` when `req.accepts("html")`.)

**Fix 2 — stop baking secrets into the image** (`dockerfile`): delete the secret `ARG`/`ENV` block (MONGODB_URI, JWT_SECRET, OAuth ids/secrets, CLIENT_URL, PORT). Keep only runtime-read env. Update `.github/workflows/docker.yml` to stop passing secrets as build-args.

**Fix 3 — drop committed `Backend/public`**: `git rm -r --cached Backend/public` and add `public` to `Backend/.gitignore`; the image build regenerates it.

**Fix 4 — trust proxy** (`Backend/server.js`): `app.set("trust proxy", true)` (or `"loopback"`/specific ALB CIDR) before routes.

**Fix 5 — configurable sandbox image names** (`sandboxRunner.js`, `terminalManager.js`): read `SANDBOX_IMAGE` / `TERMINAL_IMAGE` env (default `sandbox-runner:latest` / `opencode-terminal:latest`) so ECR-tagged images can be used without host-side re-tagging.

**Fix 6 — image-name for terminal Dockerfile**: `docker-compose.yml` references `terminal.Dockerfile` (exists) — fine; just ensure it builds in the pipeline too.

**Fix 7 — optional `NODE_ENV`** in `Backend/.env.example` and CI.

---

## Part O — Go-Live Checklist

1. ✅ Apply Part N fixes (1–5) and merge.
2. ✅ Create AWS account(s), set up Terraform S3/DynamoDB state, bootstrap `deploy/terraform`.
3. ✅ Create ECR repos; push current images once.
4. ✅ Provision Mongo Atlas (prod cluster), Redis (ElastiCache), EFS.
5. ✅ Store all Part D secrets in Secrets Manager.
6. ✅ Create DNS records + ACM certs; update OAuth redirect URIs; set CLIENT_URL.
7. ✅ Stand up LiveKit (self-host on ECS-EC2 + NLB + TURN, or LiveKit Cloud).
8. ✅ Jenkins instance + pipeline; first build green.
9. ✅ `terraform apply`; verify `/health`, login (Google/GitHub), create/edit a room, chat, comments, code exec (sandboxed), terminal, git panel, AI chat/agent/search, AV call (LiveKit).
10. ✅ Configure alarms + backups; then cut over DNS.

---

*Prepared from a verified audit of the current repository (Part A references real file:line locations). Next actionable step: apply Part N fixes, then scaffold `deploy/terraform` + `Jenkinsfile`.*
