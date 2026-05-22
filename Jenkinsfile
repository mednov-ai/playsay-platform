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
    - name: kaniko
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
    timestamps()
  }

  environment {
    GITHUB_OWNER = 'mednov-ai'
    IMAGE_NAME = 'playsay-api-gateway'
    INFRA_REPO = 'https://github.com/mednov-ai/playsay-infra.git'
    INFRA_BRANCH = 'develop'
  }

  stages {
    stage('Backend test') {
      steps {
        container('gradle') {
          dir('backend') {
            sh 'gradle :api-gateway:test :api-gateway:bootJar --no-daemon'
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

    stage('Build and push image') {
      when {
        branch 'develop'
      }
      steps {
        container('kaniko') {
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
                --destination "ghcr.io/${GITHUB_OWNER}/${IMAGE_NAME}:${GIT_COMMIT}" \
                --destination "ghcr.io/${GITHUB_OWNER}/${IMAGE_NAME}:dev"
            '''
          }
        }
      }
    }

    stage('Update dev image tag') {
      when {
        branch 'develop'
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
              yq -i ".image.tag = strenv(GIT_COMMIT)" helm-charts/hello-world/values-dev.yaml
              git config user.email "jenkins@play-and-say.ru"
              git config user.name "Play&Say Jenkins"
              git add helm-charts/hello-world/values-dev.yaml
              git commit -m "chore: bump api-gateway image to ${GIT_COMMIT}" || exit 0
              git push origin "HEAD:${INFRA_BRANCH}"
            '''
          }
        }
      }
    }
  }
}
