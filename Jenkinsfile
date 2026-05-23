pipeline {
  agent {
    kubernetes {
      yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: gradle
      image: gradle:8-jdk21
      command: ["cat"]
      tty: true
      resources:
        requests:
          cpu: 250m
          memory: 768Mi
        limits:
          cpu: "2"
          memory: 1536Mi
    - name: node
      image: node:22
      command: ["cat"]
      tty: true
      resources:
        requests:
          cpu: 150m
          memory: 384Mi
        limits:
          cpu: "1"
          memory: 1024Mi
    - name: kaniko-backend
      image: gcr.io/kaniko-project/executor:debug
      command: ["/busybox/cat"]
      tty: true
      volumeMounts:
        - name: kaniko-docker-config
          mountPath: /kaniko/.docker
      resources:
        requests:
          cpu: 250m
          memory: 512Mi
        limits:
          cpu: "2"
          memory: 1536Mi
    - name: kaniko-frontend
      image: gcr.io/kaniko-project/executor:debug
      command: ["/busybox/cat"]
      tty: true
      volumeMounts:
        - name: kaniko-docker-config
          mountPath: /kaniko/.docker
      resources:
        requests:
          cpu: 250m
          memory: 512Mi
        limits:
          cpu: "2"
          memory: 1536Mi
    - name: tools
      image: alpine:3.20
      command: ["cat"]
      tty: true
  volumes:
    - name: kaniko-docker-config
      emptyDir: {}
"""
    }
  }

  options {
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
    timestamps()
  }

  environment {
    GITHUB_OWNER = 'mednov-ai'
    API_IMAGE_NAME = 'playsay-api-gateway'
    WEB_IMAGE_NAME = 'playsay-web-app'
    INFRA_REPO = 'https://github.com/mednov-ai/playsay-infra.git'
    INFRA_BRANCH = 'develop'
  }

  stages {
    stage('Checkout') {
      steps {
        script {
          def scmVars = checkout scm
          env.GIT_COMMIT = scmVars.GIT_COMMIT ?: sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
          def branchName = scmVars.GIT_BRANCH ?: env.BRANCH_NAME ?: env.GIT_BRANCH
          if (!branchName || branchName == 'HEAD') {
            branchName = sh(script: 'git rev-parse --abbrev-ref HEAD || true', returnStdout: true).trim()
          }
          if (!branchName || branchName == 'HEAD') {
            branchName = env.JOB_NAME?.tokenize('/')?.last()?.replaceFirst(/^playsay-platform-/, '')
          }
          env.CI_BRANCH = branchName.replaceFirst(/^origin\//, '').replaceFirst(/^\*\//, '')
          echo "Checked out ${env.GIT_COMMIT} on ${env.CI_BRANCH}"
        }
      }
    }

    stage('Backend tests') {
      steps {
        container('gradle') {
          dir('backend') {
            sh 'gradle :api-gateway:test --no-daemon'
          }
        }
      }
    }

    stage('Backend package') {
      steps {
        container('gradle') {
          dir('backend') {
            sh 'gradle :api-gateway:bootJar --no-daemon'
          }
        }
      }
    }

    stage('Frontend build') {
      steps {
        container('node') {
          dir('frontend') {
            sh 'npm install --cache .npm --prefer-offline'
            sh 'npm --workspace web-app run build'
            sh 'npm --workspace web-app run test'
          }
        }
      }
    }

    stage('Build and push backend image') {
      when {
        expression { env.CI_BRANCH == 'develop' }
      }
      steps {
        container('kaniko-backend') {
          withCredentials([usernamePassword(credentialsId: 'github-ghcr', usernameVariable: 'GHCR_USER', passwordVariable: 'GHCR_TOKEN')]) {
            sh '''
              set -eu
              mkdir -p /kaniko/.docker
              AUTH="$(printf "%s:%s" "$GHCR_USER" "$GHCR_TOKEN" | base64 | tr -d '\\n')"
              cat > /kaniko/.docker/config.json <<EOF
{"auths":{"ghcr.io":{"auth":"$AUTH"}}}
EOF
              /kaniko/executor \
                --context "$WORKSPACE/backend" \
                --dockerfile "$WORKSPACE/backend/api-gateway/Dockerfile" \
                --destination "ghcr.io/${GITHUB_OWNER}/${API_IMAGE_NAME}:${GIT_COMMIT}" \
                --destination "ghcr.io/${GITHUB_OWNER}/${API_IMAGE_NAME}:dev"
            '''
          }
        }
      }
    }

    stage('Build and push frontend image') {
      when {
        expression { env.CI_BRANCH == 'develop' }
      }
      steps {
        container('kaniko-frontend') {
          withCredentials([usernamePassword(credentialsId: 'github-ghcr', usernameVariable: 'GHCR_USER', passwordVariable: 'GHCR_TOKEN')]) {
            sh '''
              set -eu
              mkdir -p /kaniko/.docker
              AUTH="$(printf "%s:%s" "$GHCR_USER" "$GHCR_TOKEN" | base64 | tr -d '\\n')"
              cat > /kaniko/.docker/config.json <<EOF
{"auths":{"ghcr.io":{"auth":"$AUTH"}}}
EOF
              /kaniko/executor \
                --context "$WORKSPACE/frontend" \
                --dockerfile "$WORKSPACE/frontend/web-app/Dockerfile" \
                --destination "ghcr.io/${GITHUB_OWNER}/${WEB_IMAGE_NAME}:${GIT_COMMIT}" \
                --destination "ghcr.io/${GITHUB_OWNER}/${WEB_IMAGE_NAME}:dev"
            '''
          }
        }
      }
    }

    stage('Update dev image tag') {
      when {
        expression { env.CI_BRANCH == 'develop' }
      }
      steps {
        container('tools') {
          withCredentials([usernamePassword(credentialsId: 'github-infra-token', usernameVariable: 'GITHUB_USER', passwordVariable: 'GITHUB_TOKEN')]) {
            sh '''
              set -eu
              apk add --no-cache git yq
              rm -rf infra
              AUTH_REPO="$(echo "$INFRA_REPO" | sed "s#https://#https://${GITHUB_USER}:${GITHUB_TOKEN}@#")"
              git clone --branch "$INFRA_BRANCH" "$AUTH_REPO" infra
              cd infra
              yq -i ".image.tag = strenv(GIT_COMMIT)" helm-charts/api-gateway/values-dev.yaml
              yq -i ".image.tag = strenv(GIT_COMMIT)" helm-charts/web-app/values-dev.yaml
              git config user.email "jenkins@play-and-say.ru"
              git config user.name "Play&Say Jenkins"
              git add helm-charts/api-gateway/values-dev.yaml helm-charts/web-app/values-dev.yaml
              git commit -m "chore: bump dev image tags to ${GIT_COMMIT}" || exit 0
              git push origin "HEAD:${INFRA_BRANCH}"
            '''
          }
        }
      }
    }
  }
}
