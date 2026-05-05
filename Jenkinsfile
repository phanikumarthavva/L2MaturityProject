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
