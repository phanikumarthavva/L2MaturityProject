pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    AWS_REGION       = 'ap-south-1'
    EKS_CLUSTER_NAME = 'prm-auto-cluster'
    NAMESPACE        = 'prm'

    DOCKERHUB_USER = 'phanikumart'

    API_IMAGE = "docker.io/${DOCKERHUB_USER}/prm-api"
    WEB_IMAGE = "docker.io/${DOCKERHUB_USER}/prm-web"

    DOCDB_CLUSTER_ID = 'prm-docdb-cluster'

    BEDROCK_REGION   = 'ap-south-1'
    BEDROCK_MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0'

    SECURITY_REPORT_DIR = 'security-reports'

    IMAGE_TAG = "${BUILD_NUMBER}-${GIT_COMMIT}"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm

        sh '''
          echo "Current commit:"
          git rev-parse --short HEAD
        '''
      }
    }

    stage('Verify Required Files') {
      steps {
        sh '''
          echo "Checking required files..."

          test -f backend/Dockerfile
          test -f frontend/Dockerfile
          test -f k8s/03-configmap-nginx.yaml
          test -f k8s/04-deployment-api.yaml
          test -f k8s/05-service-api.yaml
          test -f k8s/06-deployment-web.yaml

          if [ ! -f backend/global-bundle.pem ]; then
            echo "Downloading DocumentDB CA bundle..."
            curl -o backend/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
          fi

          echo "Validating backend Dockerfile has DocumentDB certificate copy..."
          grep "global-bundle.pem" backend/Dockerfile

          echo "Required file validation complete."
        '''
      }
    }

    stage('Install Dependencies') {
      steps {
        sh '''
          node --version
          npm --version
          npm ci
        '''
      }
    }

    stage('Build Application') {
      steps {
        sh '''
          npm run build --workspaces --if-present
        '''
      }
    }

    stage('Docker Login') {
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'dockerhub-creds',
            usernameVariable: 'DOCKERHUB_USERNAME',
            passwordVariable: 'DOCKERHUB_TOKEN'
          )
        ]) {
          sh '''
            echo "$DOCKERHUB_TOKEN" | docker login \
              --username "$DOCKERHUB_USERNAME" \
              --password-stdin
          '''
        }
      }
    }

    stage('Build Docker Images') {
      steps {
        sh '''
          echo "Building API image..."
          docker build -f backend/Dockerfile \
            -t "$API_IMAGE:$IMAGE_TAG" \
            -t "$API_IMAGE:latest" \
            .

          echo "Building Web image..."
          docker build -f frontend/Dockerfile \
            -t "$WEB_IMAGE:$IMAGE_TAG" \
            -t "$WEB_IMAGE:latest" \
            .
        '''
      }
    }

    stage('Prepare Security Reports') {
      steps {
        sh '''
          rm -rf "$SECURITY_REPORT_DIR"
          mkdir -p "$SECURITY_REPORT_DIR"
        '''
      }
    }

    stage('Snyk Security Scan') {
      steps {
        withCredentials([
          string(credentialsId: 'snyk-token', variable: 'SNYK_TOKEN')
        ]) {
          sh '''
            echo "Installing Snyk CLI locally in workspace..."

            npm install --no-save snyk

            ./node_modules/.bin/snyk auth "$SNYK_TOKEN"

            echo "Running Snyk dependency scan..."
            ./node_modules/.bin/snyk test --all-projects \
              --json-file-output="$SECURITY_REPORT_DIR/snyk-dependencies.json" || true

            echo "Running Snyk code scan..."
            ./node_modules/.bin/snyk code test \
              --json-file-output="$SECURITY_REPORT_DIR/snyk-code.json" || true

            echo "Running Snyk API container scan..."
            ./node_modules/.bin/snyk container test "$API_IMAGE:$IMAGE_TAG" \
              --file=backend/Dockerfile \
              --json-file-output="$SECURITY_REPORT_DIR/snyk-api-container.json" || true

            echo "Running Snyk Web container scan..."
            ./node_modules/.bin/snyk container test "$WEB_IMAGE:$IMAGE_TAG" \
              --file=frontend/Dockerfile \
              --json-file-output="$SECURITY_REPORT_DIR/snyk-web-container.json" || true
          '''
        }
      }

      post {
        always {
          archiveArtifacts artifacts: 'security-reports/snyk-*.json', allowEmptyArchive: true
        }
      }
    }

    stage('Checkov IaC Scan') {
      steps {
        sh '''
          echo "Running Checkov scan on Kubernetes manifests..."

          docker run --rm \
            -v "$PWD":/workspace \
            bridgecrew/checkov:latest \
            -d /workspace/k8s \
            --framework kubernetes \
            -o json \
            --output-file-path /workspace/$SECURITY_REPORT_DIR/checkov-k8s.json || true

          echo "Checkov scan completed."
        '''
      }

      post {
        always {
          archiveArtifacts artifacts: 'security-reports/checkov-k8s.json', allowEmptyArchive: true
        }
      }
    }

    stage('Generate SBOM with Syft') {
      steps {
        sh '''
          echo "Generating SBOM for API image..."

          docker run --rm \
            -v /var/run/docker.sock:/var/run/docker.sock \
            -v "$PWD":/workspace \
            anchore/syft:latest \
            "$API_IMAGE:$IMAGE_TAG" \
            -o spdx-json=/workspace/$SECURITY_REPORT_DIR/sbom-api.spdx.json

          echo "Generating SBOM for Web image..."

          docker run --rm \
            -v /var/run/docker.sock:/var/run/docker.sock \
            -v "$PWD":/workspace \
            anchore/syft:latest \
            "$WEB_IMAGE:$IMAGE_TAG" \
            -o spdx-json=/workspace/$SECURITY_REPORT_DIR/sbom-web.spdx.json

          ls -lh "$SECURITY_REPORT_DIR"
        '''
      }

      post {
        always {
          archiveArtifacts artifacts: 'security-reports/sbom-*.spdx.json', allowEmptyArchive: true
        }
      }
    }

    stage('Security Gate') {
      steps {
        sh '''
          echo "Running lightweight security gate..."

          CRITICAL_COUNT=0

          if [ -f "$SECURITY_REPORT_DIR/snyk-dependencies.json" ]; then
            COUNT=$(grep -o '"severity":"critical"' "$SECURITY_REPORT_DIR/snyk-dependencies.json" | wc -l || true)
            CRITICAL_COUNT=$((CRITICAL_COUNT + COUNT))
          fi

          if [ -f "$SECURITY_REPORT_DIR/snyk-api-container.json" ]; then
            COUNT=$(grep -o '"severity":"critical"' "$SECURITY_REPORT_DIR/snyk-api-container.json" | wc -l || true)
            CRITICAL_COUNT=$((CRITICAL_COUNT + COUNT))
          fi

          if [ -f "$SECURITY_REPORT_DIR/snyk-web-container.json" ]; then
            COUNT=$(grep -o '"severity":"critical"' "$SECURITY_REPORT_DIR/snyk-web-container.json" | wc -l || true)
            CRITICAL_COUNT=$((CRITICAL_COUNT + COUNT))
          fi

          echo "Critical finding count: $CRITICAL_COUNT"

          if [ "$CRITICAL_COUNT" -gt 0 ]; then
            echo "Critical security findings detected. Failing build."
            exit 1
          fi

          echo "Security gate passed."
        '''
      }
    }

    stage('LLM Security Review with AWS Bedrock') {
      steps {
        withCredentials([[
          $class: 'AmazonWebServicesCredentialsBinding',
          credentialsId: 'aws-bedrock-creds',
          accessKeyVariable: 'AWS_ACCESS_KEY_ID',
          secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
        ]]) {
          sh '''
            echo "Preparing security findings for Bedrock LLM review..."

            python3 <<'PY'
import json
from pathlib import Path

report_dir = Path("security-reports")
report_dir.mkdir(exist_ok=True)

files = [
    "snyk-dependencies.json",
    "snyk-code.json",
    "snyk-api-container.json",
    "snyk-web-container.json",
    "checkov-k8s.json",
    "sbom-api.spdx.json",
    "sbom-web.spdx.json",
]

combined = []

for name in files:
    path = report_dir / name
    if not path.exists():
        continue

    text = path.read_text(errors="ignore")

    if len(text) > 30000:
        text = text[:30000] + "\\n...TRUNCATED..."

    combined.append(f"\\n\\n===== {name} =====\\n{text}")

prompt = f"""
You are a senior application security reviewer.

Review the following CI security scan outputs from a Jenkins pipeline.

Focus on:
1. Critical and high vulnerabilities.
2. Exploitable dependency risks.
3. Container image risks.
4. Kubernetes IaC misconfigurations.
5. Secrets exposure risk.
6. Missing security controls.
7. Practical remediation steps.

Do not invent findings.
If the scan data is incomplete or truncated, say so.
Prioritize findings as: Critical, High, Medium, Low.

Return a concise Markdown report with:
- Executive summary
- Top risks
- Evidence from reports
- Recommended fixes
- Deployment recommendation: PASS, PASS_WITH_WARNINGS, or BLOCK

Security reports:
{''.join(combined)}
"""

payload = {
    "anthropic_version": "bedrock-2023-05-31",
    "max_tokens": 4000,
    "temperature": 0,
    "messages": [
        {
            "role": "user",
            "content": prompt
        }
    ]
}

Path("bedrock-security-payload.json").write_text(json.dumps(payload))
PY

            aws bedrock-runtime invoke-model \
              --region "$BEDROCK_REGION" \
              --model-id "$BEDROCK_MODEL_ID" \
              --content-type "application/json" \
              --accept "application/json" \
              --body fileb://bedrock-security-payload.json \
              bedrock-security-response.json

            python3 <<'PY'
import json
from pathlib import Path

response = json.loads(Path("bedrock-security-response.json").read_text())

content = response.get("content", [])
text_parts = []

for item in content:
    if item.get("type") == "text":
        text_parts.append(item.get("text", ""))

review = "\\n".join(text_parts).strip()

if not review:
    review = json.dumps(response, indent=2)

Path("security-reports/llm-security-review.md").write_text(review)

print(review)
PY
          '''
        }
      }

      post {
        always {
          archiveArtifacts artifacts: 'security-reports/llm-security-review.md,bedrock-security-response.json', allowEmptyArchive: true
        }
      }
    }

    stage('Push Docker Images') {
      steps {
        sh '''
          echo "Pushing API image..."
          docker push "$API_IMAGE:$IMAGE_TAG"
          docker push "$API_IMAGE:latest"

          echo "Pushing Web image..."
          docker push "$WEB_IMAGE:$IMAGE_TAG"
          docker push "$WEB_IMAGE:latest"
        '''
      }
    }

    stage('Configure EKS Access') {
      steps {
        withCredentials([[
          $class: 'AmazonWebServicesCredentialsBinding',
          credentialsId: 'aws-eks-creds',
          accessKeyVariable: 'AWS_ACCESS_KEY_ID',
          secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
        ]]) {
          sh '''
            aws sts get-caller-identity

            aws eks update-kubeconfig \
              --region "$AWS_REGION" \
              --name "$EKS_CLUSTER_NAME"

            kubectl get ns
          '''
        }
      }
    }

    stage('Create Namespace') {
      steps {
        withCredentials([[
          $class: 'AmazonWebServicesCredentialsBinding',
          credentialsId: 'aws-eks-creds',
          accessKeyVariable: 'AWS_ACCESS_KEY_ID',
          secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
        ]]) {
          sh '''
            aws eks update-kubeconfig \
              --region "$AWS_REGION" \
              --name "$EKS_CLUSTER_NAME"

            kubectl create namespace "$NAMESPACE" \
              --dry-run=client -o yaml | kubectl apply -f -
          '''
        }
      }
    }

    stage('Create App Secret and ConfigMap') {
      steps {
        withCredentials([
          [
            $class: 'AmazonWebServicesCredentialsBinding',
            credentialsId: 'aws-eks-creds',
            accessKeyVariable: 'AWS_ACCESS_KEY_ID',
            secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
          ],
          string(credentialsId: 'docdb-username', variable: 'DOCDB_USERNAME'),
          string(credentialsId: 'docdb-password', variable: 'DOCDB_PASSWORD'),
          string(credentialsId: 'jwt-secret', variable: 'JWT_SECRET')
        ]) {
          sh '''
            aws eks update-kubeconfig \
              --region "$AWS_REGION" \
              --name "$EKS_CLUSTER_NAME"

            DOCDB_ENDPOINT=$(aws docdb describe-db-clusters \
              --region "$AWS_REGION" \
              --db-cluster-identifier "$DOCDB_CLUSTER_ID" \
              --query "DBClusters[0].Endpoint" \
              --output text)

            echo "Using DocumentDB endpoint: $DOCDB_ENDPOINT"

            DOCDB_URI="mongodb://${DOCDB_USERNAME}:${DOCDB_PASSWORD}@${DOCDB_ENDPOINT}:27017/prm?tls=true&tlsCAFile=global-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false&authMechanism=SCRAM-SHA-1"

            kubectl -n "$NAMESPACE" create secret generic prm-secrets \
              --from-literal=mongo-uri="$DOCDB_URI" \
              --from-literal=jwt-secret="$JWT_SECRET" \
              --dry-run=client -o yaml | kubectl apply -f -

            kubectl -n "$NAMESPACE" create configmap prm-app-config \
              --from-literal=jwt-expires-in='7d' \
              --from-literal=cors-origin='*' \
              --dry-run=client -o yaml | kubectl apply -f -

            kubectl -n "$NAMESPACE" describe secret prm-secrets
            kubectl -n "$NAMESPACE" describe configmap prm-app-config
          '''
        }
      }
    }

    stage('Deploy API First') {
      steps {
        withCredentials([[
          $class: 'AmazonWebServicesCredentialsBinding',
          credentialsId: 'aws-eks-creds',
          accessKeyVariable: 'AWS_ACCESS_KEY_ID',
          secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
        ]]) {
          sh '''
            aws eks update-kubeconfig \
              --region "$AWS_REGION" \
              --name "$EKS_CLUSTER_NAME"

            echo "Deploying API deployment..."
            kubectl apply -f k8s/04-deployment-api.yaml

            echo "Setting API image to immutable build tag..."
            kubectl -n "$NAMESPACE" set image deployment/prm-api \
              api="$API_IMAGE:$IMAGE_TAG"

            echo "Deploying API service before web..."
            kubectl apply -f k8s/05-service-api.yaml

            echo "Waiting for API rollout..."
            kubectl -n "$NAMESPACE" rollout status deployment/prm-api --timeout=300s

            kubectl -n "$NAMESPACE" get pods -l app=prm-api
            kubectl -n "$NAMESPACE" get svc prm-api
          '''
        }
      }
    }

    stage('Deploy Web') {
      steps {
        withCredentials([[
          $class: 'AmazonWebServicesCredentialsBinding',
          credentialsId: 'aws-eks-creds',
          accessKeyVariable: 'AWS_ACCESS_KEY_ID',
          secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
        ]]) {
          sh '''
            aws eks update-kubeconfig \
              --region "$AWS_REGION" \
              --name "$EKS_CLUSTER_NAME"

            echo "Applying nginx config..."
            kubectl apply -f k8s/03-configmap-nginx.yaml

            echo "Deploying web deployment..."
            kubectl apply -f k8s/06-deployment-web.yaml

            echo "Setting web image to immutable build tag..."
            kubectl -n "$NAMESPACE" set image deployment/prm-web \
              web="$WEB_IMAGE:$IMAGE_TAG"

            echo "Waiting for web rollout..."
            kubectl -n "$NAMESPACE" rollout status deployment/prm-web --timeout=300s

            kubectl -n "$NAMESPACE" get pods -l app=prm-web
          '''
        }
      }
    }

    stage('Expose Web LoadBalancer') {
      steps {
        withCredentials([[
          $class: 'AmazonWebServicesCredentialsBinding',
          credentialsId: 'aws-eks-creds',
          accessKeyVariable: 'AWS_ACCESS_KEY_ID',
          secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
        ]]) {
          sh '''
            aws eks update-kubeconfig \
              --region "$AWS_REGION" \
              --name "$EKS_CLUSTER_NAME"

            echo "Creating or updating internet-facing web LoadBalancer..."

            cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: prm-web
  namespace: prm
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-scheme: internet-facing
    service.beta.kubernetes.io/aws-load-balancer-nlb-target-type: ip
spec:
  type: LoadBalancer
  selector:
    app: prm-web
  ports:
    - name: http
      port: 80
      targetPort: 80
      protocol: TCP
EOF

            kubectl -n "$NAMESPACE" get svc prm-web
            kubectl -n "$NAMESPACE" describe svc prm-web
          '''
        }
      }
    }

    stage('Wait for LoadBalancer DNS') {
      steps {
        withCredentials([[
          $class: 'AmazonWebServicesCredentialsBinding',
          credentialsId: 'aws-eks-creds',
          accessKeyVariable: 'AWS_ACCESS_KEY_ID',
          secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
        ]]) {
          sh '''
            aws eks update-kubeconfig \
              --region "$AWS_REGION" \
              --name "$EKS_CLUSTER_NAME"

            echo "Waiting for LoadBalancer DNS..."

            for i in $(seq 1 40); do
              WEB_LB=$(kubectl -n "$NAMESPACE" get svc prm-web -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)

              if [ -n "$WEB_LB" ]; then
                echo "LoadBalancer DNS: $WEB_LB"
                echo "$WEB_LB" > web-lb.txt
                exit 0
              fi

              echo "Waiting for LoadBalancer DNS... attempt $i"
              sleep 15
            done

            echo "LoadBalancer DNS not ready."
            kubectl -n "$NAMESPACE" describe svc prm-web
            exit 1
          '''
        }
      }
    }

    stage('Update CORS with Web URL') {
      steps {
        withCredentials([
          [
            $class: 'AmazonWebServicesCredentialsBinding',
            credentialsId: 'aws-eks-creds',
            accessKeyVariable: 'AWS_ACCESS_KEY_ID',
            secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
          ],
          string(credentialsId: 'docdb-username', variable: 'DOCDB_USERNAME'),
          string(credentialsId: 'docdb-password', variable: 'DOCDB_PASSWORD'),
          string(credentialsId: 'jwt-secret', variable: 'JWT_SECRET')
        ]) {
          sh '''
            aws eks update-kubeconfig \
              --region "$AWS_REGION" \
              --name "$EKS_CLUSTER_NAME"

            WEB_LB=$(cat web-lb.txt)

            DOCDB_ENDPOINT=$(aws docdb describe-db-clusters \
              --region "$AWS_REGION" \
              --db-cluster-identifier "$DOCDB_CLUSTER_ID" \
              --query "DBClusters[0].Endpoint" \
              --output text)

            DOCDB_URI="mongodb://${DOCDB_USERNAME}:${DOCDB_PASSWORD}@${DOCDB_ENDPOINT}:27017/prm?tls=true&tlsCAFile=global-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false&authMechanism=SCRAM-SHA-1"

            echo "Updating secret and CORS configmap..."

            kubectl -n "$NAMESPACE" create secret generic prm-secrets \
              --from-literal=mongo-uri="$DOCDB_URI" \
              --from-literal=jwt-secret="$JWT_SECRET" \
              --dry-run=client -o yaml | kubectl apply -f -

            kubectl -n "$NAMESPACE" create configmap prm-app-config \
              --from-literal=jwt-expires-in='7d' \
              --from-literal=cors-origin="http://$WEB_LB" \
              --dry-run=client -o yaml | kubectl apply -f -

            echo "Restarting API to load updated CORS config..."
            kubectl -n "$NAMESPACE" rollout restart deployment/prm-api
            kubectl -n "$NAMESPACE" rollout status deployment/prm-api --timeout=300s
          '''
        }
      }
    }

    stage('Smoke Test') {
      steps {
        withCredentials([[
          $class: 'AmazonWebServicesCredentialsBinding',
          credentialsId: 'aws-eks-creds',
          accessKeyVariable: 'AWS_ACCESS_KEY_ID',
          secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
        ]]) {
          sh '''
            aws eks update-kubeconfig \
              --region "$AWS_REGION" \
              --name "$EKS_CLUSTER_NAME"

            WEB_LB=$(cat web-lb.txt)

            echo "Current pods:"
            kubectl -n "$NAMESPACE" get pods

            echo "Current services:"
            kubectl -n "$NAMESPACE" get svc

            echo "Testing internal API health..."
            kubectl -n "$NAMESPACE" run curl-api-test \
              --rm -i \
              --restart=Never \
              --image=curlimages/curl \
              -- curl -sS http://prm-api:4000/health

            echo "Testing internal web health..."
            kubectl -n "$NAMESPACE" run curl-web-test \
              --rm -i \
              --restart=Never \
              --image=curlimages/curl \
              -- curl -I http://prm-web

            echo "Testing external web URL..."
            echo "Application URL: http://$WEB_LB"

            for i in $(seq 1 30); do
              if curl -I --connect-timeout 10 "http://$WEB_LB"; then
                echo "Web is reachable externally: http://$WEB_LB"
                exit 0
              fi

              echo "Waiting for ELB DNS/targets... attempt $i"
              sleep 15
            done

            echo "External LoadBalancer not reachable yet."
            kubectl -n "$NAMESPACE" describe svc prm-web
            exit 1
          '''
        }
      }
    }
  }

  post {
    success {
      echo 'Deployment successful.'

      sh '''
        if [ -f web-lb.txt ]; then
          echo "Application URL:"
          cat web-lb.txt | awk '{print "http://" $1}'
        fi
      '''
    }

    failure {
      echo 'Deployment failed.'

      withCredentials([[
        $class: 'AmazonWebServicesCredentialsBinding',
        credentialsId: 'aws-eks-creds',
        accessKeyVariable: 'AWS_ACCESS_KEY_ID',
        secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
      ]]) {
        sh '''
          aws eks update-kubeconfig \
            --region "$AWS_REGION" \
            --name "$EKS_CLUSTER_NAME" || true

          echo "Pods:"
          kubectl -n "$NAMESPACE" get pods || true

          echo "Services:"
          kubectl -n "$NAMESPACE" get svc || true

          echo "Events:"
          kubectl -n "$NAMESPACE" get events --sort-by=.lastTimestamp | tail -50 || true

          echo "API logs:"
          kubectl -n "$NAMESPACE" logs deployment/prm-api --tail=100 || true

          echo "Web logs:"
          kubectl -n "$NAMESPACE" logs deployment/prm-web --tail=100 || true
        '''
      }
    }

    always {
      sh '''
        docker logout || true
        docker image prune -f || true
      '''
    }
  }
}
