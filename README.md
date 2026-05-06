# Enterprise Project & Resource Management (PRM)

Production-style monorepo for project, task, and user management with JWT authentication, role-based access control (Admin, Manager, User), and a React dashboard.

This project is also a DevSecOps reference implementation for moving from maturity level L2 to L3. It demonstrates containerization, Kubernetes deployment, Jenkins CI/CD, security scanning, SBOM generation, IaC scanning, and LLM-assisted security review.

> **Important:** This repository must not contain real secrets, tokens, passwords, MongoDB URIs, AWS keys, Docker Hub tokens, Snyk tokens, or Bedrock credentials. Store all secrets in Jenkins credentials or a secrets manager.

---

## Table of contents

- [Architecture](#architecture)
- [Repository structure](#repository-structure)
- [Application stack](#application-stack)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Docker Hub images](#docker-hub-images)
- [AWS EKS deployment architecture](#aws-eks-deployment-architecture)
- [Amazon DocumentDB configuration](#amazon-documentdb-configuration)
- [Kubernetes resources](#kubernetes-resources)
- [Jenkins prerequisites](#jenkins-prerequisites)
- [Jenkins credentials required](#jenkins-credentials-required)
- [Jenkins pipeline overview](#jenkins-pipeline-overview)
- [Security scanning in Jenkins](#security-scanning-in-jenkins)
- [AWS Bedrock LLM security review](#aws-bedrock-llm-security-review)
- [Clean deployment process](#clean-deployment-process)
- [Manual validation commands](#manual-validation-commands)
- [Troubleshooting guide](#troubleshooting-guide)
- [Operational notes](#operational-notes)

---

## Architecture

```mermaid
flowchart LR
  Browser[Browser] --> ELB[AWS LoadBalancer :80]
  ELB --> Web[prm-web nginx React SPA]
  Web -->|/api proxy| ApiSvc[prm-api ClusterIP Service]
  ApiSvc --> ApiPods[prm-api Express API Pods]
  ApiPods --> DocDB[(Amazon DocumentDB)]
  Jenkins[Jenkins Pipeline] --> DockerHub[Docker Hub]
  Jenkins --> EKS[AWS EKS]
  Jenkins --> Scans[Snyk Checkov Syft Bedrock]
  DockerHub --> EKS
```

### Runtime flow

```text
Browser
  -> AWS LoadBalancer service prm-web
  -> nginx React frontend pod
  -> /api proxied to prm-api ClusterIP service
  -> backend Express API
  -> Amazon DocumentDB
```

### CI/CD flow

```text
GitHub
  -> Jenkins
  -> npm install/build
  -> Docker build
  -> Snyk scan
  -> Checkov IaC scan
  -> Syft SBOM
  -> AWS Bedrock LLM security review
  -> Docker Hub push
  -> EKS deployment
```

---

## Repository structure

```text
.
├── backend/
│   ├── Dockerfile
│   ├── global-bundle.pem
│   └── src/
├── frontend/
│   ├── Dockerfile
│   └── src/
├── k8s/
│   ├── 00-namespace.yaml
│   ├── 01-secrets.example.yaml
│   ├── 02-configmap-app.yaml
│   ├── 03-configmap-nginx.yaml
│   ├── 04-deployment-api.yaml
│   ├── 05-service-api.yaml
│   ├── 06-deployment-web.yaml
│   └── 07-service-web-loadbalancer.yaml
├── Jenkinsfile
├── package.json
└── README.md
```

---

## Application stack

### Frontend

- React
- Vite
- Tailwind CSS
- nginx for production container
- nginx proxies `/api` to the internal Kubernetes API service

### Backend

- Node.js 22
- Express
- TypeScript
- Mongoose
- JWT authentication
- RBAC
- Zod validation
- Helmet and rate limiting

### Database

- Local development: MongoDB
- AWS deployment: Amazon DocumentDB

---

## Local development

### Requirements

```text
Node.js 22+
npm 10+
Docker
Docker Compose
```

### Start locally with Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Open:

```text
UI:  http://localhost:8080
API: http://localhost:4000
Health: http://localhost:4000/health
```

### Default login

On first API startup, the application creates a default super admin:

```text
Username: superadmin
Email: superadmin@prm.local
Password: superadmin
```

For production, disable the default account:

```text
DISABLE_DEFAULT_SUPERADMIN=true
```

---

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `MONGO_URI` | API | MongoDB / DocumentDB connection string |
| `JWT_SECRET` | API | JWT signing secret |
| `JWT_EXPIRES_IN` | API | JWT expiry, for example `7d` |
| `PORT` | API | API port, default `4000` |
| `CORS_ORIGIN` | API | Allowed frontend origin |
| `NODE_ENV` | API | `development` or `production` |
| `VITE_API_URL` | Frontend | Optional API URL; empty when nginx proxies `/api` |

Do not commit `.env` files with real values.

---

## Docker Hub images

This project uses Docker Hub, not Amazon ECR.

Required Docker Hub repositories:

```text
username/prm-api
username/prm-web
```

Image names used by Kubernetes and Jenkins:

```text
docker.io/username/prm-api:<tag>
docker.io/username/prm-web:<tag>
```

The Jenkins pipeline builds both immutable build tags and `latest`:

```text
docker.io/username/prm-api:<BUILD_NUMBER>-<GIT_COMMIT>
docker.io/username/prm-api:latest
docker.io/username/prm-web:<BUILD_NUMBER>-<GIT_COMMIT>
docker.io/username/prm-web:latest
```

---

## AWS EKS deployment architecture

Recommended deployment target:

```text
AWS Region: ap-south-1
EKS cluster: prm-auto-cluster
Namespace: prm
Compute: EKS Auto Mode
Public entry point: Kubernetes Service type LoadBalancer
```

The API is not publicly exposed. Only the web service is exposed through an AWS LoadBalancer.

```text
prm-api service: ClusterIP, port 4000
prm-web service: LoadBalancer, port 80
```

---

## Amazon DocumentDB configuration

### Critical requirement

Amazon DocumentDB must be reachable from the EKS pod network.

The clean setup is:

```text
DocumentDB VPC = EKS VPC
DocumentDB security group allows inbound TCP 27017 from EKS security group
DocumentDB subnet group uses subnets in the EKS VPC
```

### Why this matters

If DocumentDB and EKS are in different VPCs, the API will fail with errors such as:

```text
MongooseServerSelectionError: Server selection timed out after 30000 ms
ReplicaSetNoPrimary
```

If you try to authorize security group access across different VPCs without proper peering/routing, AWS may return:

```text
You have specified two resources that belong to different networks
```

### DocumentDB connection string

The working DocumentDB URI format is:

```text
mongodb://USER:PASSWORD@DOCDB-ENDPOINT:27017/prm?tls=true&tlsCAFile=global-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false&authMechanism=SCRAM-SHA-1
```

Required query parameters:

```text
tls=true
tlsCAFile=global-bundle.pem
replicaSet=rs0
readPreference=secondaryPreferred
retryWrites=false
authMechanism=SCRAM-SHA-1
```

### Password guidance

Use a URI-safe password for DocumentDB, especially in Jenkins:

```text
Good example: PrmAdminPassword2026
Avoid special characters: @ # $ % & : / ? !
```

If special characters are used, they must be URL encoded.

### DocumentDB TLS certificate

The API image must include:

```text
/app/global-bundle.pem
```

Download certificate:

```bash
curl -o backend/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

Backend Dockerfile must include:

```dockerfile
COPY backend/global-bundle.pem ./global-bundle.pem
```

This fixes:

```text
ENOENT: no such file or directory, open 'global-bundle.pem'
```

---

## Kubernetes resources

The namespace is:

```text
prm
```

Required runtime objects:

```text
Namespace: prm
Secret: prm-secrets
ConfigMap: prm-app-config
ConfigMap: prm-web-nginx
Deployment: prm-api
Service: prm-api
Deployment: prm-web
Service: prm-web
```

### Kubernetes secret

The Jenkins pipeline creates this dynamically:

```text
Secret name: prm-secrets
Keys:
  mongo-uri
  jwt-secret
```

Manual example:

```bash
kubectl -n prm create secret generic prm-secrets \
  --from-literal=mongo-uri='mongodb://USER:PASSWORD@DOCDB-ENDPOINT:27017/prm?tls=true&tlsCAFile=global-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false&authMechanism=SCRAM-SHA-1' \
  --from-literal=jwt-secret='YOUR_LONG_RANDOM_SECRET'
```

### Kubernetes configmap

The Jenkins pipeline creates and updates:

```text
ConfigMap name: prm-app-config
Keys:
  jwt-expires-in
  cors-origin
```

Initial CORS is set to:

```text
*
```

After the LoadBalancer DNS is created, Jenkins updates CORS to:

```text
http://<prm-web-loadbalancer-dns>
```

Then Jenkins restarts the API deployment so the API reads the new value.

---

## Jenkins prerequisites

The Jenkins server or Jenkins agent must have:

```bash
git --version
node --version
npm --version
docker --version
aws --version
kubectl version --client
python3 --version
```

### Docker permission for Jenkins

The Jenkins user must be able to run Docker:

```bash
sudo usermod -aG docker jenkins
sudo systemctl restart docker
sudo systemctl restart jenkins
```

Verify:

```bash
groups jenkins
sudo -u jenkins docker ps
```

If Docker socket permissions are wrong:

```bash
ls -l /var/run/docker.sock
sudo chown root:docker /var/run/docker.sock
sudo chmod 660 /var/run/docker.sock
sudo systemctl restart docker
sudo systemctl restart jenkins
```

---

## Jenkins credentials required

Create these in:

```text
Jenkins -> Manage Jenkins -> Credentials -> Global
```

### 1. Docker Hub

```text
ID: dockerhub-creds
Type: Username with password
Username: username
Password: Docker Hub access token
```

Use a Docker Hub access token, not the account password.

### 2. AWS EKS credentials

```text
ID: aws-eks-creds
Type: AWS Credentials
Access key: AWS access key
Secret key: AWS secret key
```

Required permissions include:

```text
eks:DescribeCluster
eks:ListClusters
docdb:DescribeDBClusters
ec2:Describe*
elasticloadbalancing:Describe*
```

The identity must be authorized to access the EKS cluster.

### 3. AWS Bedrock credentials

```text
ID: aws-bedrock-creds
Type: AWS Credentials
Access key: AWS access key
Secret key: AWS secret key
```

Required Bedrock permissions:

```json
{
  "Effect": "Allow",
  "Action": [
    "bedrock:InvokeModel",
    "bedrock:InvokeModelWithResponseStream"
  ],
  "Resource": "*"
}
```

### 4. DocumentDB username

```text
ID: docdb-username
Type: Secret text
Value: prmadmin
```

### 5. DocumentDB password

```text
ID: docdb-password
Type: Secret text
Value: your working DocumentDB password
```

Recommended: use an alphanumeric password to avoid Mongo URI parsing issues.

### 6. JWT secret

```text
ID: jwt-secret
Type: Secret text
Value: long random JWT secret
```

Generate one:

```bash
openssl rand -base64 48
```

### 7. Snyk token

```text
ID: snyk-token
Type: Secret text
Value: Snyk API token
```

---

## Jenkins pipeline overview

The Jenkinsfile performs:

```text
1. Checkout
2. Fix workspace permissions
3. Verify required files
4. npm install
5. Application build
6. Docker login
7. Docker image build
8. Security report directory cleanup
9. Snyk security scan
10. Checkov Kubernetes IaC scan
11. Syft SBOM generation
12. Security gate
13. AWS Bedrock LLM security review
14. Docker image push
15. EKS access configuration
16. Namespace creation
17. Secret and ConfigMap creation
18. API deployment first
19. API ClusterIP service creation
20. Web deployment
21. Web LoadBalancer creation
22. LoadBalancer DNS wait
23. CORS update
24. API restart
25. Smoke tests
```

### Why API is deployed before web

The nginx config in the web pod references:

```text
prm-api.prm.svc.cluster.local
```

If the `prm-api` service does not exist before web starts, nginx can fail with:

```text
host not found in upstream "prm-api.prm.svc.cluster.local"
```

Therefore, the pipeline deploys:

```text
API deployment -> API service -> Web deployment -> Web LoadBalancer
```

---

## Security scanning in Jenkins

### Snyk

Runs:

```text
Dependency scan
Source/code scan
API container scan
Web container scan
```

Snyk is installed locally in the Jenkins workspace, not globally. This avoids permission errors like:

```text
EACCES: permission denied, mkdir '/usr/local/lib/node_modules'
```

### Checkov

Runs Kubernetes IaC scanning against:

```text
k8s/
```

The pipeline writes Checkov JSON to:

```text
security-reports/checkov-k8s.json
```

The pipeline avoids Checkov creating root-owned report directories by redirecting JSON output to a file and fixing ownership afterward.

### Syft SBOM

Generates SBOM files:

```text
security-reports/sbom-api.spdx.json
security-reports/sbom-web.spdx.json
```

Syft uses the local Docker daemon image reference:

```text
docker:<image>:<tag>
```

The pipeline sets cache and temp directories inside the workspace:

```text
.syft-cache
.syft-tmp
```

This avoids errors like:

```text
unable to get filesystem cache at /.cache/syft
permission denied
```

### Security gate

The lightweight security gate currently fails the build if critical Snyk findings are found in:

```text
snyk-dependencies.json
snyk-api-container.json
snyk-web-container.json
```

---

## AWS Bedrock LLM security review

The pipeline uses AWS Bedrock to summarize security outputs and produce:

```text
security-reports/llm-security-review.md
security-reports/bedrock-security-input-summary.json
```

The LLM review uses compact summaries instead of full JSON/SBOM files to avoid model input limits such as:

```text
ValidationException: Input is too long for requested model
```

Default model configured in Jenkinsfile:

```text
anthropic.claude-3-haiku-20240307-v1:0
```

Default Bedrock region:

```text
ap-south-1
```

If your Bedrock model is enabled in another region, update:

```groovy
BEDROCK_REGION = 'your-region'
BEDROCK_MODEL_ID = 'your-model-id'
```

### LLM review output

The report includes:

```text
Executive summary
Critical findings
High findings
Medium findings
Kubernetes/IaC concerns
SBOM observations
Recommended fixes
Deployment recommendation
```

### Important security note

The LLM report is advisory. Blocking decisions should be based on deterministic tools such as Snyk, Checkov, and policy gates.

---

## Clean deployment process

Before running Jenkins for a fresh deployment, clean the app namespace:

```bash
kubectl delete namespace prm
```

This removes:

```text
API pods/deployments
Web pods/deployments
Services
ConfigMaps
Secrets
LoadBalancer service
```

It does not delete:

```text
EKS cluster
DocumentDB cluster
Docker Hub images
IAM roles
VPC/subnets/NAT gateways
CloudWatch logs
```

After namespace deletion, AWS may take a few minutes to delete the old LoadBalancer.

Verify:

```bash
kubectl get ns
kubectl get svc -A
```

Optional AWS verification:

```bash
aws elbv2 describe-load-balancers \
  --region ap-south-1 \
  --query "LoadBalancers[*].{Name:LoadBalancerName,DNS:DNSName,State:State.Code,Scheme:Scheme}" \
  --output table
```

---

## Manual validation commands

### Check pods

```bash
kubectl -n prm get pods
```

Expected:

```text
prm-api   1/1 Running
prm-web   1/1 Running
```

### Check services

```bash
kubectl -n prm get svc
```

Expected:

```text
prm-api   ClusterIP
prm-web   LoadBalancer
```

### Check API logs

```bash
kubectl -n prm logs deployment/prm-api --tail=100
```

### Check web logs

```bash
kubectl -n prm logs deployment/prm-web --tail=100
```

### Test API internally

```bash
kubectl -n prm run curl-api-test \
  --rm -it \
  --restart=Never \
  --image=curlimages/curl \
  -- curl -sS http://prm-api:4000/health
```

### Test web internally

```bash
kubectl -n prm run curl-web-test \
  --rm -it \
  --restart=Never \
  --image=curlimages/curl \
  -- curl -I http://prm-web
```

### Get public web URL

```bash
kubectl -n prm get svc prm-web
```

Open:

```text
http://<load-balancer-dns>
```

---

## Troubleshooting guide

### Docker Hub push access denied

Check:

```bash
docker logout
docker login
docker info | grep Username
```

Confirm repositories exist:

```text
username/prm-api
username/prm-web
```

### Docker invalid tag

If you see:

```text
invalid tag "docker.io//prm-api:"
```

Your variables are empty:

```bash
echo "$DOCKERHUB_USER"
echo "$TAG"
```

Set:

```bash
export DOCKERHUB_USER="username"
export TAG="manual-1"
```

### Jenkins cannot access Docker

Error:

```text
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
```

Fix:

```bash
sudo usermod -aG docker jenkins
sudo systemctl restart docker
sudo systemctl restart jenkins
sudo -u jenkins docker ps
```

### kubectl NoCredentials in Jenkins

EKS kubeconfig uses AWS IAM auth for every `kubectl` call. Every Jenkins stage using `kubectl` must run inside AWS credentials binding:

```groovy
withCredentials([[
  $class: 'AmazonWebServicesCredentialsBinding',
  credentialsId: 'aws-eks-creds',
  accessKeyVariable: 'AWS_ACCESS_KEY_ID',
  secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
]]) {
  sh 'kubectl get ns'
}
```

### API missing global-bundle.pem

Error:

```text
ENOENT: no such file or directory, open 'global-bundle.pem'
```

Fix:

```bash
curl -o backend/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

Dockerfile must contain:

```dockerfile
COPY backend/global-bundle.pem ./global-bundle.pem
```

### API cannot reach DocumentDB

Error:

```text
MongooseServerSelectionError
ReplicaSetNoPrimary
Server selection timed out
```

Likely causes:

```text
DocumentDB in different VPC
DocumentDB SG missing inbound 27017 from EKS SG
Wrong subnet group
Routing issue
Wrong endpoint
```

Fix:

```text
Create DocumentDB in the same VPC as EKS
Allow inbound TCP 27017 from EKS security group
Use the new DocumentDB endpoint in Jenkins credentials/pipeline
```

### Mongo password parse error

Error:

```text
MongoParseError: Password contains unescaped characters
```

Fix:

```text
Use alphanumeric password, or URL encode special characters
```

### Unsupported authentication mechanism

Error:

```text
Unsupported mechanism
supportedMechanisms: ["SCRAM-SHA-1","MONGODB-AWS"]
```

Fix Mongo URI:

```text
authMechanism=SCRAM-SHA-1
```

### Web pod CrashLoopBackOff

Error:

```text
host not found in upstream "prm-api.prm.svc.cluster.local"
```

Fix:

```bash
kubectl apply -f k8s/05-service-api.yaml
kubectl -n prm rollout restart deployment/prm-web
```

The API service must exist before nginx starts.

### LoadBalancer DNS not resolving

Error:

```text
Could not resolve host
```

Wait a few minutes. Check:

```bash
kubectl -n prm get svc prm-web
kubectl -n prm describe svc prm-web
```

Do not repeatedly delete and recreate the service unless necessary, because each recreate generates a new AWS DNS name.

### Browser timeout but pods are healthy

Check:

```bash
kubectl -n prm get endpoints prm-web
kubectl -n prm logs deployment/prm-web --tail=100
```

If endpoints exist and `/health` returns 200, the issue is usually:

```text
LoadBalancer still provisioning
DNS not ready
AWS target health not ready
Security group/listener issue
```

### Snyk npm permission error

Error:

```text
EACCES: permission denied, mkdir '/usr/local/lib/node_modules'
```

Fix: install Snyk locally in Jenkins workspace:

```bash
npm install --no-save snyk
./node_modules/.bin/snyk test --all-projects
```

### Checkov report permission error

If Checkov creates root-owned files, clean with Docker and chown:

```bash
docker run --rm -v "$PWD":/workspace alpine:3.20 \
  sh -c "chown -R $(id -u):$(id -g) /workspace/security-reports"
```

### Syft cache permission error

Error:

```text
unable to get filesystem cache at /.cache/syft
permission denied
```

Fix: set workspace cache and temp directories:

```text
SYFT_CACHE_DIR=/workspace/.syft-cache
TMPDIR=/workspace/.syft-tmp
```

### Bedrock input too long

Error:

```text
ValidationException: Input is too long for requested model
```

Fix: send compact summaries to Bedrock, not full Snyk/Checkov/SBOM JSON.

---

## Operational notes

### Keep DocumentDB

Do not delete the working DocumentDB cluster when cleaning Kubernetes. Jenkins expects:

```text
DOCDB_CLUSTER_ID = prm-docdb-cluster
```

### Keep Docker Hub repositories

Required:

```text
username/prm-api
username/prm-web
```

### Keep Jenkins credentials updated

If DocumentDB password changes, update:

```text
docdb-password
```

If the JWT secret changes, update:

```text
jwt-secret
```

### CORS

The pipeline initially deploys with:

```text
cors-origin=*
```

After the web LoadBalancer DNS is available, Jenkins updates it to:

```text
http://<load-balancer-dns>
```

Then Jenkins restarts the API.

### Security artifacts

Jenkins archives:

```text
security-reports/snyk-*.json
security-reports/checkov-k8s.json
security-reports/sbom-*.spdx.json
security-reports/llm-security-review.md
security-reports/bedrock-security-input-summary.json
bedrock-security-response.json
```

### Deployment ownership

After Jenkins is configured, avoid manual changes to Kubernetes resources. If manual testing is needed, clean and rerun Jenkins:

```bash
kubectl delete namespace prm
```

Then start the Jenkins job again.

---

## Final working state

A successful deployment should show:

```bash
kubectl -n prm get pods
```

```text
prm-api   1/1 Running
prm-web   1/1 Running
```

```bash
kubectl -n prm get svc
```

```text
prm-api   ClusterIP
prm-web   LoadBalancer
```

The final application URL is printed in Jenkins:

```text
Application URL:
http://<prm-web-loadbalancer-dns>
```
