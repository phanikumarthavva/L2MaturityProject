# Kubernetes manifests (EKS, plain YAML)

- **No Helm.** Apply with `kubectl apply -f ...`.
- **Public UI on port 80:** `07-service-web-loadbalancer.yaml` uses `type: LoadBalancer`. AWS creates a classic/ELB or NLB with a DNS name; traffic hits nginx on port 80, which proxies `/api` to the API **inside the cluster** (no ALB Ingress Controller).
- **API is not exposed publicly** by default (ClusterIP only). The browser only talks to the web LoadBalancer.

## Files

| File | Purpose |
|------|---------|
| `00-namespace.yaml` | Namespace `prm` |
| `01-secrets.example.yaml` | Copy to `secrets-local.yaml`, fill, apply once |
| `02-configmap-app.yaml` | `CORS_ORIGIN`, JWT expiry (edit `cors-origin` after you know the web LB URL) |
| `03-configmap-nginx.yaml` | Nginx `proxy_pass` to in-cluster `prm-api` |
| `04-deployment-api.yaml` | API Deployment — **replace image** |
| `05-service-api.yaml` | ClusterIP Service `prm-api:4000` |
| `06-deployment-web.yaml` | Web Deployment — **replace image**, mounts nginx ConfigMap |
| `07-service-web-loadbalancer.yaml` | Public LoadBalancer on **port 80** |

## Before you apply

1. Replace `YOUR_DOCKERHUB_USER` in `04-deployment-api.yaml` and `06-deployment-web.yaml` (or patch after push).
2. Build and push images (`prm-api`, `prm-web`) from this repo’s Dockerfiles (same as `docker compose build`).
3. MongoDB must accept connections from **EKS worker node security groups** (Atlas IP allowlist, DocumentDB SG, etc.).
