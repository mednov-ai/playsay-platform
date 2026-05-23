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

  parameters {
    string(name: 'BRANCH_NAME', defaultValue: 'develop', description: 'Git branch to build and deploy to dev, for example develop, feature/task-1, release/1.001.00', trim: true)
  }

  environment {
    GITHUB_OWNER = 'mednov-ai'
    API_IMAGE_NAME = 'playsay-api-gateway'
    WEB_IMAGE_NAME = 'playsay-web-app'
    PLATFORM_REPO = 'https://github.com/mednov-ai/playsay-platform.git'
    INFRA_REPO = 'https://github.com/mednov-ai/playsay-infra.git'
    INFRA_BRANCH = 'develop'
  }

  stages {
    stage('Checkout') {
      steps {
        script {
          def requestedBranch = params.BRANCH_NAME?.trim() ?: 'develop'
          echo "Checking out playsay-platform branch '${requestedBranch}'"
          def scmVars = checkout([
            $class: 'GitSCM',
            branches: [[name: "*/${requestedBranch}"]],
            doGenerateSubmoduleConfigurations: false,
            extensions: [],
            submoduleCfg: [],
            userRemoteConfigs: [[url: env.PLATFORM_REPO]]
          ])
          env.GIT_COMMIT = scmVars.GIT_COMMIT ?: sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
          env.GIT_COMMIT_SHORT = env.GIT_COMMIT.take(12)
          env.CI_BRANCH = requestedBranch.replaceFirst(/^origin\//, '').replaceFirst(/^\*\//, '')

          def buildPrefix = env.CI_BRANCH
          if (env.CI_BRANCH == 'develop') {
            buildPrefix = 'dev'
          } else if (env.CI_BRANCH.startsWith('feature/')) {
            buildPrefix = "f_${env.CI_BRANCH.substring('feature/'.length())}"
          } else if (env.CI_BRANCH.startsWith('release/')) {
            buildPrefix = "rel_${env.CI_BRANCH.substring('release/'.length())}"
          } else if (env.CI_BRANCH.startsWith('hotfix/')) {
            buildPrefix = "hotfix_${env.CI_BRANCH.substring('hotfix/'.length())}"
          }
          buildPrefix = buildPrefix.replaceAll(/[^A-Za-z0-9_.-]/, '-')
          buildPrefix = buildPrefix.replaceAll(/^[^A-Za-z0-9]+/, '').replaceAll(/[^A-Za-z0-9]+$/, '')
          if (!buildPrefix) {
            buildPrefix = 'build'
          }
          int maxPrefixLength = 63 - env.BUILD_NUMBER.length() - 1
          if (buildPrefix.length() > maxPrefixLength) {
            buildPrefix = buildPrefix.take(maxPrefixLength).replaceAll(/[^A-Za-z0-9]+$/, '')
          }
          env.BUILD_LABEL_PREFIX = buildPrefix
          env.BUILD_LABEL = "${buildPrefix}-${env.BUILD_NUMBER}"
          env.DEPLOY_TO_DEV = (
            env.CI_BRANCH == 'develop' ||
            env.CI_BRANCH.startsWith('feature/') ||
            env.CI_BRANCH.startsWith('release/') ||
            env.CI_BRANCH.startsWith('hotfix/')
          ).toString()

          currentBuild.displayName = env.BUILD_LABEL
          currentBuild.description = "${env.CI_BRANCH} @ ${env.GIT_COMMIT_SHORT}"
          echo "Build label: ${env.BUILD_LABEL}"
          echo "Source branch: ${env.CI_BRANCH}"
          echo "Source commit: ${env.GIT_COMMIT}"
          echo "Deploy to dev: ${env.DEPLOY_TO_DEV}"
        }
      }
    }

    stage('Backend tests') {
      steps {
        container('gradle') {
          dir('backend') {
            echo "Running backend tests for ${env.BUILD_LABEL}"
            sh 'gradle :api-gateway:test --no-daemon --stacktrace'
          }
        }
      }
    }

    stage('Backend package') {
      steps {
        container('gradle') {
          dir('backend') {
            echo "Packaging api-gateway for ${env.BUILD_LABEL}"
            sh 'gradle :api-gateway:bootJar --no-daemon'
          }
        }
      }
    }

    stage('Frontend build') {
      steps {
        container('node') {
          dir('frontend') {
            echo "Installing frontend dependencies for ${env.BUILD_LABEL}"
            sh 'npm install --cache .npm --prefer-offline'
            echo "Building frontend for ${env.BUILD_LABEL}"
            sh 'npm --workspace web-app run build'
            echo "Running frontend tests for ${env.BUILD_LABEL}"
            sh 'npm --workspace web-app run test'
          }
        }
      }
    }

    stage('Build and push backend image') {
      when {
        expression { env.DEPLOY_TO_DEV == 'true' }
      }
      steps {
        container('kaniko-backend') {
          withCredentials([usernamePassword(credentialsId: 'github-ghcr', usernameVariable: 'GHCR_USER', passwordVariable: 'GHCR_TOKEN')]) {
            sh '''
              set -eu
              JAR_COUNT="$(find "$WORKSPACE/backend/api-gateway/build/libs" -maxdepth 1 -name "*.jar" | wc -l | tr -d " ")"
              if [ "$JAR_COUNT" != "1" ]; then
                echo "Expected exactly one api-gateway bootJar, found $JAR_COUNT"
                find "$WORKSPACE/backend/api-gateway/build/libs" -maxdepth 1 -type f -print || true
                exit 1
              fi
              ls -lh "$WORKSPACE/backend/api-gateway/build/libs"/*.jar
              mkdir -p /kaniko/.docker
              AUTH="$(printf "%s:%s" "$GHCR_USER" "$GHCR_TOKEN" | base64 | tr -d '\\n')"
              cat > /kaniko/.docker/config.json <<EOF
{"auths":{"ghcr.io":{"auth":"$AUTH"}}}
EOF
              /kaniko/executor \
                --context "$WORKSPACE/backend" \
                --dockerfile "$WORKSPACE/backend/api-gateway/Dockerfile" \
                --destination "ghcr.io/${GITHUB_OWNER}/${API_IMAGE_NAME}:${GIT_COMMIT}" \
                --destination "ghcr.io/${GITHUB_OWNER}/${API_IMAGE_NAME}:${BUILD_LABEL}" \
                --destination "ghcr.io/${GITHUB_OWNER}/${API_IMAGE_NAME}:dev"
            '''
          }
        }
      }
    }

    stage('Build and push frontend image') {
      when {
        expression { env.DEPLOY_TO_DEV == 'true' }
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
                --destination "ghcr.io/${GITHUB_OWNER}/${WEB_IMAGE_NAME}:${BUILD_LABEL}" \
                --destination "ghcr.io/${GITHUB_OWNER}/${WEB_IMAGE_NAME}:dev"
            '''
          }
        }
      }
    }

    stage('Tag source commit') {
      when {
        expression { env.DEPLOY_TO_DEV == 'true' }
      }
      steps {
        container('tools') {
          withCredentials([usernamePassword(credentialsId: 'github-infra-token', usernameVariable: 'GITHUB_USER', passwordVariable: 'GITHUB_TOKEN')]) {
            sh '''
              set -eu
              apk add --no-cache git
              git config --global user.email "jenkins@play-and-say.ru"
              git config --global user.name "Play&Say Jenkins"
              AUTH_REPO="$(echo "$PLATFORM_REPO" | sed "s#https://#https://${GITHUB_USER}:${GITHUB_TOKEN}@#")"
              if git ls-remote --exit-code --tags "$AUTH_REPO" "refs/tags/${BUILD_LABEL}" >/dev/null 2>&1; then
                echo "Source tag ${BUILD_LABEL} already exists"
              else
                rm -rf source-for-tag
                git clone --branch "$CI_BRANCH" "$AUTH_REPO" source-for-tag
                cd source-for-tag
                git checkout "$GIT_COMMIT"
                git tag -a "$BUILD_LABEL" \
                  -m "Play&Say build ${BUILD_LABEL}" \
                  -m "Branch: ${CI_BRANCH}" \
                  -m "Commit: ${GIT_COMMIT}" \
                  -m "Jenkins build: ${BUILD_URL}"
                git push "$AUTH_REPO" "refs/tags/${BUILD_LABEL}"
              fi
            '''
          }
        }
      }
    }

    stage('Update dev image tags') {
      when {
        expression { env.DEPLOY_TO_DEV == 'true' }
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
              yq -i ".image.tag = strenv(BUILD_LABEL) | .build.name = strenv(BUILD_LABEL) | .build.number = strenv(BUILD_NUMBER) | .build.branch = strenv(CI_BRANCH) | .build.branchLabel = strenv(BUILD_LABEL_PREFIX) | .build.commit = strenv(GIT_COMMIT) | .build.commitShort = strenv(GIT_COMMIT_SHORT)" helm-charts/api-gateway/values-dev.yaml
              yq -i ".image.tag = strenv(BUILD_LABEL) | .build.name = strenv(BUILD_LABEL) | .build.number = strenv(BUILD_NUMBER) | .build.branch = strenv(CI_BRANCH) | .build.branchLabel = strenv(BUILD_LABEL_PREFIX) | .build.commit = strenv(GIT_COMMIT) | .build.commitShort = strenv(GIT_COMMIT_SHORT)" helm-charts/web-app/values-dev.yaml
              git config user.email "jenkins@play-and-say.ru"
              git config user.name "Play&Say Jenkins"
              git add helm-charts/api-gateway/values-dev.yaml helm-charts/web-app/values-dev.yaml
              git commit \
                -m "chore: deploy ${BUILD_LABEL} to dev" \
                -m "Source branch: ${CI_BRANCH}" \
                -m "Source commit: ${GIT_COMMIT}" || exit 0
              git tag -a "$BUILD_LABEL" \
                -m "Play&Say dev deployment ${BUILD_LABEL}" \
                -m "Source branch: ${CI_BRANCH}" \
                -m "Source commit: ${GIT_COMMIT}"
              git push origin "HEAD:${INFRA_BRANCH}" "refs/tags/${BUILD_LABEL}"
            '''
          }
        }
      }
    }
  }

  post {
    always {
      echo "Build ${env.BUILD_LABEL ?: env.BUILD_NUMBER} finished with ${currentBuild.currentResult}"
    }
  }
}
