pipeline {
  agent {
    kubernetes {
      yaml """
apiVersion: v1
kind: Pod
spec:
  serviceAccountName: jenkins
  activeDeadlineSeconds: 2400
  securityContext:
    fsGroup: 1000
    fsGroupChangePolicy: OnRootMismatch
  containers:
    - name: jnlp
      image: jenkins/inbound-agent:3383.vc8881d4b_0e76-1-jdk25
      resources:
        requests:
          cpu: 50m
          memory: 128Mi
        limits:
          cpu: 300m
          memory: 384Mi
    - name: gradle
      image: gradle:8-jdk21
      command: ["cat"]
      tty: true
      env:
        - name: JAVA_TOOL_OPTIONS
          value: "-XX:ActiveProcessorCount=1"
      volumeMounts:
        - name: jenkins-agent-cache
          mountPath: /home/gradle/.gradle
          subPath: gradle-full
      resources:
        requests:
          cpu: 450m
          memory: 1Gi
        limits:
          cpu: "1"
          memory: 2Gi
    - name: node-frontend
      image: node:22
      command: ["cat"]
      tty: true
      volumeMounts:
        - name: jenkins-agent-cache
          mountPath: /cache/npm
          subPath: npm
      resources:
        requests:
          cpu: 250m
          memory: 512Mi
        limits:
          cpu: "1"
          memory: 1Gi
    - name: node-collaboration
      image: node:22
      command: ["cat"]
      tty: true
      volumeMounts:
        - name: jenkins-agent-cache
          mountPath: /cache/npm
          subPath: npm
      resources:
        requests:
          cpu: 150m
          memory: 384Mi
        limits:
          cpu: "1"
          memory: 768Mi
    - name: kaniko-backend
      image: gcr.io/kaniko-project/executor:debug
      command: ["/busybox/cat"]
      tty: true
      volumeMounts:
        - name: kaniko-docker-config
          mountPath: /kaniko/.docker
      resources:
        requests:
          cpu: 150m
          memory: 256Mi
        limits:
          cpu: "1"
          memory: 1024Mi
    - name: kaniko-frontend
      image: gcr.io/kaniko-project/executor:debug
      command: ["/busybox/cat"]
      tty: true
      volumeMounts:
        - name: kaniko-docker-config
          mountPath: /kaniko/.docker
      resources:
        requests:
          cpu: 150m
          memory: 256Mi
        limits:
          cpu: "1"
          memory: 1024Mi
    - name: kaniko-collaboration
      image: gcr.io/kaniko-project/executor:debug
      command: ["/busybox/cat"]
      tty: true
      volumeMounts:
        - name: kaniko-docker-config
          mountPath: /kaniko/.docker
      resources:
        requests:
          cpu: 150m
          memory: 256Mi
        limits:
          cpu: "1"
          memory: 1024Mi
    - name: kaniko-media
      image: gcr.io/kaniko-project/executor:debug
      command: ["/busybox/cat"]
      tty: true
      volumeMounts:
        - name: kaniko-docker-config
          mountPath: /kaniko/.docker
      resources:
        requests:
          cpu: 150m
          memory: 256Mi
        limits:
          cpu: "1"
          memory: 1024Mi
    - name: kaniko-payment
      image: gcr.io/kaniko-project/executor:debug
      command: ["/busybox/cat"]
      tty: true
      volumeMounts:
        - name: kaniko-docker-config
          mountPath: /kaniko/.docker
      resources:
        requests:
          cpu: 150m
          memory: 256Mi
        limits:
          cpu: "1"
          memory: 1024Mi
    - name: kaniko-registration
      image: gcr.io/kaniko-project/executor:debug
      command: ["/busybox/cat"]
      tty: true
      volumeMounts:
        - name: kaniko-docker-config
          mountPath: /kaniko/.docker
      resources:
        requests:
          cpu: 150m
          memory: 256Mi
        limits:
          cpu: "1"
          memory: 1024Mi
    - name: kaniko-email
      image: gcr.io/kaniko-project/executor:debug
      command: ["/busybox/cat"]
      tty: true
      volumeMounts:
        - name: kaniko-docker-config
          mountPath: /kaniko/.docker
      resources:
        requests:
          cpu: 150m
          memory: 256Mi
        limits:
          cpu: "1"
          memory: 1024Mi
    - name: tools
      image: alpine:3.20
      command: ["cat"]
      tty: true
      resources:
        requests:
          cpu: 25m
          memory: 32Mi
        limits:
          cpu: 200m
          memory: 128Mi
    - name: capacity-guard
      image: alpine/k8s:1.33.1
      command: ["/bin/sh", "/scripts/guard.sh"]
      env:
        - name: POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
      resources:
        requests:
          cpu: 10m
          memory: 24Mi
        limits:
          cpu: 100m
          memory: 96Mi
      volumeMounts:
        - name: capacity-scripts
          mountPath: /scripts
          readOnly: true
    - name: smoke
      image: mcr.microsoft.com/playwright:v1.56.1-noble
      command: ["cat"]
      tty: true
      env:
        - name: PLAY_SAY_SMOKE_TEACHER_PASSWORD
          valueFrom:
            secretKeyRef:
              name: keycloak-dev-users
              key: teacher-demo-password
              optional: true
        - name: PLAY_SAY_SMOKE_STUDENT_A_PASSWORD
          valueFrom:
            secretKeyRef:
              name: keycloak-dev-users
              key: student-demo-password
              optional: true
        - name: PLAY_SAY_SMOKE_STUDENT_B_PASSWORD
          valueFrom:
            secretKeyRef:
              name: keycloak-dev-users
              key: student-demo-2-password
              optional: true
      volumeMounts:
        - name: jenkins-agent-cache
          mountPath: /cache/npm
          subPath: npm
      resources:
        requests:
          cpu: 250m
          memory: 512Mi
        limits:
          cpu: "1"
          memory: 1536Mi
    - name: liquibase
      image: liquibase/liquibase:5.0.3
      command: ["cat"]
      tty: true
      securityContext:
        runAsUser: 1000
        runAsGroup: 0
      env:
        - name: PLAYSAY_DB_JDBC_URL
          valueFrom:
            secretKeyRef:
              name: playsay-app-db
              key: jdbc-uri
        - name: PLAYSAY_DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: playsay-app-db
              key: username
        - name: PLAYSAY_DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: playsay-app-db
              key: password
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          cpu: 500m
          memory: 512Mi
  volumes:
    - name: capacity-scripts
      configMap:
        name: playsay-ci-capacity-scripts
        defaultMode: 0555
    - name: kaniko-docker-config
      emptyDir: {}
    - name: jenkins-agent-cache
      persistentVolumeClaim:
        claimName: jenkins-agent-cache
"""
    }
  }

  options {
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
    timestamps()
    timeout(time: 30, unit: 'MINUTES')
  }

  parameters {
    string(name: 'BRANCH_NAME', defaultValue: 'develop', description: 'Git branch to build and deploy to dev, for example develop, codex/task-1, feature/task-1, release/1.001.00', trim: true)
    string(name: 'AFFECTED_TARGETS', defaultValue: 'all', description: 'Comma-separated deploy targets to build: all, api-gateway, web-app, collaboration-service, media-service, payment-service, registration-service, email-service.', trim: true)
    string(name: 'GITHUB_BEFORE', defaultValue: '', description: 'GitHub push before SHA for dispatcher traceability.', trim: true)
    string(name: 'GITHUB_AFTER', defaultValue: '', description: 'GitHub push after SHA to build exactly, when dispatched from webhook.', trim: true)
  }

  environment {
    GITHUB_OWNER = 'mednov-ai'
    API_IMAGE_NAME = 'playsay-api-gateway'
    WEB_IMAGE_NAME = 'playsay-web-app'
    COLLABORATION_IMAGE_NAME = 'playsay-collaboration-service'
    MEDIA_IMAGE_NAME = 'playsay-media-service'
    PAYMENT_IMAGE_NAME = 'playsay-payment-service'
    REGISTRATION_IMAGE_NAME = 'playsay-registration-service'
    EMAIL_IMAGE_NAME = 'playsay-email-service'
    PLATFORM_REPO = 'https://github.com/mednov-ai/playsay-platform.git'
    INFRA_REPO = 'https://github.com/mednov-ai/playsay-infra.git'
    INFRA_BRANCH = 'develop'
    PROD_AUTH_ISSUER = 'https://key.honey.school/keycloak/realms/playsay'
  }

  stages {
    stage('Checkout') {
      steps {
        script {
          def requestedBranch = params.BRANCH_NAME?.trim() ?: 'develop'
          def requestedCommit = params.GITHUB_AFTER?.trim()
          echo "Checking out playsay-platform branch '${requestedBranch}'"
          def scmVars = checkout([
            $class: 'GitSCM',
            branches: [[name: "*/${requestedBranch}"]],
            doGenerateSubmoduleConfigurations: false,
            extensions: [],
            submoduleCfg: [],
            userRemoteConfigs: [[url: env.PLATFORM_REPO]]
          ])
          if (requestedCommit) {
            sh "git fetch --no-tags origin +refs/heads/${requestedBranch}:refs/remotes/origin/${requestedBranch}"
            sh "git checkout --detach ${requestedCommit}"
          }
          env.GIT_COMMIT = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
          env.GIT_COMMIT_SHORT = env.GIT_COMMIT.take(12)
          env.CI_BRANCH = requestedBranch.replaceFirst(/^origin\//, '').replaceFirst(/^\*\//, '')

          def targetParam = params.AFFECTED_TARGETS?.trim() ?: 'all'
          def validTargets = ['api-gateway', 'web-app', 'collaboration-service', 'media-service', 'payment-service', 'registration-service', 'email-service'] as Set
          def requestedTargets = [] as Set
          if (targetParam == 'all') {
            requestedTargets.addAll(validTargets)
          } else {
            targetParam.split(',').collect { it.trim() }.findAll { it }.each { requestedTargets.add(it) }
          }
          def invalidTargets = requestedTargets.findAll { !validTargets.contains(it) }
          if (invalidTargets) {
            error "Unknown AFFECTED_TARGETS value(s): ${invalidTargets.join(', ')}"
          }
          env.RUN_API_GATEWAY = requestedTargets.contains('api-gateway').toString()
          env.RUN_WEB_APP = requestedTargets.contains('web-app').toString()
          env.RUN_COLLABORATION_SERVICE = requestedTargets.contains('collaboration-service').toString()
          env.RUN_MEDIA_SERVICE = requestedTargets.contains('media-service').toString()
          env.RUN_PAYMENT_SERVICE = requestedTargets.contains('payment-service').toString()
          env.RUN_REGISTRATION_SERVICE = requestedTargets.contains('registration-service').toString()
          env.RUN_EMAIL_SERVICE = requestedTargets.contains('email-service').toString()
          env.RUN_ANY_TARGET = (!requestedTargets.isEmpty()).toString()
          env.AFFECTED_TARGETS_RESOLVED = requestedTargets.join(',')

          def buildPrefix = env.CI_BRANCH
          if (env.CI_BRANCH == 'develop') {
            buildPrefix = 'dev'
          } else if (env.CI_BRANCH.startsWith('feature/')) {
            buildPrefix = "f_${env.CI_BRANCH.substring('feature/'.length())}"
          } else if (env.CI_BRANCH.startsWith('codex/')) {
            buildPrefix = "codex_${env.CI_BRANCH.substring('codex/'.length())}"
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
            env.CI_BRANCH.startsWith('codex/') ||
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
          echo "Affected targets: ${env.AFFECTED_TARGETS_RESOLVED ?: '(none)'}"
        }
      }
    }

    stage('Reserve build capacity') {
      steps {
        container('tools') {
          sh 'apk add --no-cache curl jq kubectl && CI_BUILD_ID="${JOB_NAME}-${BUILD_NUMBER}" ./scripts/ci/manage-build-capacity.sh acquire'
        }
      }
    }

    stage('Build, test, and validate') {
      parallel {
        stage('Backend validation') {
          when {
            expression { env.RUN_API_GATEWAY == 'true' || env.RUN_MEDIA_SERVICE == 'true' || env.RUN_PAYMENT_SERVICE == 'true' || env.RUN_REGISTRATION_SERVICE == 'true' || env.RUN_EMAIL_SERVICE == 'true' }
          }
          stages {
            stage('Backend test and package') {
              steps {
                container('gradle') {
                  dir('backend') {
                    echo "Testing and packaging affected backend services for ${env.BUILD_LABEL}"
                    sh '''
                      set -eu
                      TASKS=""
                      if [ "$RUN_API_GATEWAY" = "true" ]; then TASKS="$TASKS :api-gateway:test :api-gateway:bootJar :api-gateway:exportOpenApi"; fi
                      if [ "$RUN_MEDIA_SERVICE" = "true" ]; then TASKS="$TASKS :media-service:test :media-service:bootJar"; fi
                      if [ "$RUN_PAYMENT_SERVICE" = "true" ]; then TASKS="$TASKS :payment-service:test :payment-service:bootJar"; fi
                      if [ "$RUN_REGISTRATION_SERVICE" = "true" ]; then TASKS="$TASKS :registration-service:test :registration-service:bootJar"; fi
                      if [ "$RUN_EMAIL_SERVICE" = "true" ]; then TASKS="$TASKS :email-service:test :email-service:bootJar"; fi
                      gradle $TASKS -PlowMemoryTests --no-daemon --stacktrace --max-workers=1 -Pkotlin.compiler.execution.strategy=in-process
                    '''
                  }
                }
              }
            }

            stage('OpenAPI contract') {
              when {
                expression { env.RUN_API_GATEWAY == 'true' }
              }
              steps {
                sh '''
                  set -eu
                  git diff --exit-code -- contracts/openapi.yaml || {
                    echo "contracts/openapi.yaml is out of sync with api-gateway. Run gradle :api-gateway:exportOpenApi and commit the result."
                    exit 1
                  }
                '''
                archiveArtifacts artifacts: 'contracts/openapi.yaml', fingerprint: true
              }
            }
          }
        }

        stage('Frontend build') {
          when {
            expression { env.RUN_WEB_APP == 'true' }
          }
          steps {
            container('node-frontend') {
              dir('frontend') {
                echo "Installing frontend dependencies for ${env.BUILD_LABEL}"
                sh 'npm install --cache /cache/npm --prefer-offline'
                echo "Generating typed frontend API client for ${env.BUILD_LABEL}"
                sh 'npm --workspace web-app run generate'
                echo "Linting frontend for ${env.BUILD_LABEL}"
                sh 'npm --workspace web-app run lint'
                echo "Building frontend for ${env.BUILD_LABEL}"
                sh '''
                  if [ "$DEPLOY_TO_DEV" = "true" ]; then
                    export VITE_EXTERNAL_ACTIVITY_ENABLED=true
                  fi
                  case "$CI_BRANCH" in
                    release/*) export VITE_AUTH_ISSUER="$PROD_AUTH_ISSUER" ;;
                  esac
                  npm --workspace web-app run build
                '''
                echo "Running frontend tests for ${env.BUILD_LABEL}"
                sh 'npm --workspace web-app run test'
                echo "Building and testing the Play&Say browser extension for ${env.BUILD_LABEL}"
                sh 'npm --workspace browser-extension run test'
                sh 'npm --workspace browser-extension run package'
              }
            }
            archiveArtifacts artifacts: 'frontend/browser-extension/playsay-browser-extension.zip', fingerprint: true
          }
        }

        stage('Collaboration service build') {
          when {
            expression { env.RUN_COLLABORATION_SERVICE == 'true' }
          }
          steps {
            container('node-collaboration') {
              dir('collaboration-service') {
                echo "Installing collaboration service dependencies for ${env.BUILD_LABEL}"
                sh 'npm ci --cache /cache/npm --prefer-offline'
                echo "Testing collaboration service for ${env.BUILD_LABEL}"
                sh 'npm test'
                echo "Building collaboration service for ${env.BUILD_LABEL}"
                sh 'npm run build'
              }
            }
          }
        }
      }
    }

    stage('DB migrate') {
      when {
        expression { env.DEPLOY_TO_DEV == 'true' && (env.RUN_API_GATEWAY == 'true' || env.RUN_PAYMENT_SERVICE == 'true' || env.RUN_REGISTRATION_SERVICE == 'true' || env.RUN_EMAIL_SERVICE == 'true') }
      }
      steps {
        container('liquibase') {
          echo "Applying affected database migrations for ${env.BUILD_LABEL}"
          sh '''
            set -eu
            POSTGRES_JDBC_VERSION="42.7.8"
            POSTGRES_JDBC_JAR="/tmp/postgresql-${POSTGRES_JDBC_VERSION}.jar"
            if [ ! -f "$POSTGRES_JDBC_JAR" ]; then
              curl -fsSL "https://repo1.maven.org/maven2/org/postgresql/postgresql/${POSTGRES_JDBC_VERSION}/postgresql-${POSTGRES_JDBC_VERSION}.jar" -o "$POSTGRES_JDBC_JAR"
            fi
            CHANGELOGS=""
            if [ "$RUN_API_GATEWAY" = "true" ]; then
              CHANGELOGS="$CHANGELOGS backend/api-gateway/src/main/resources/db/changelog/db.changelog-master.xml"
            fi
            if [ "$RUN_PAYMENT_SERVICE" = "true" ]; then
              CHANGELOGS="$CHANGELOGS backend/payment-service/src/main/resources/db/changelog/db.changelog-master.xml"
            fi
            if [ "$RUN_REGISTRATION_SERVICE" = "true" ]; then
              CHANGELOGS="$CHANGELOGS backend/registration-service/src/main/resources/db/changelog/db.changelog-master.xml"
            fi
            if [ "$RUN_EMAIL_SERVICE" = "true" ]; then
              CHANGELOGS="$CHANGELOGS backend/email-service/src/main/resources/db/changelog/db.changelog-master.xml"
            fi
            for CHANGELOG in $CHANGELOGS; do
              echo "Applying database changelog $CHANGELOG"
              liquibase \
                --changelog-file="$CHANGELOG" \
                --classpath="$POSTGRES_JDBC_JAR" \
                --url="$PLAYSAY_DB_JDBC_URL" \
                --username="$PLAYSAY_DB_USERNAME" \
                --password="$PLAYSAY_DB_PASSWORD" \
                status --verbose
              liquibase \
                --changelog-file="$CHANGELOG" \
                --classpath="$POSTGRES_JDBC_JAR" \
                --url="$PLAYSAY_DB_JDBC_URL" \
                --username="$PLAYSAY_DB_USERNAME" \
                --password="$PLAYSAY_DB_PASSWORD" \
                update
            done
          '''
        }
      }
    }

    stage('Build and push images') {
      when {
        expression { env.DEPLOY_TO_DEV == 'true' && env.RUN_ANY_TARGET == 'true' }
      }
      parallel {
        stage('Build and push backend image') {
          when {
            expression { env.RUN_API_GATEWAY == 'true' }
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
            expression { env.RUN_WEB_APP == 'true' }
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

        stage('Build and push collaboration service image') {
          when {
            expression { env.RUN_COLLABORATION_SERVICE == 'true' }
          }
          steps {
            container('kaniko-collaboration') {
              withCredentials([usernamePassword(credentialsId: 'github-ghcr', usernameVariable: 'GHCR_USER', passwordVariable: 'GHCR_TOKEN')]) {
                sh '''
                  set -eu
                  mkdir -p /kaniko/.docker
                  AUTH="$(printf "%s:%s" "$GHCR_USER" "$GHCR_TOKEN" | base64 | tr -d '\\n')"
                  cat > /kaniko/.docker/config.json <<EOF
{"auths":{"ghcr.io":{"auth":"$AUTH"}}}
EOF
                  /kaniko/executor \
                    --context "$WORKSPACE/collaboration-service" \
                    --dockerfile "$WORKSPACE/collaboration-service/Dockerfile" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${COLLABORATION_IMAGE_NAME}:${GIT_COMMIT}" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${COLLABORATION_IMAGE_NAME}:${BUILD_LABEL}" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${COLLABORATION_IMAGE_NAME}:dev"
                '''
              }
            }
          }
        }

        stage('Build and push media service image') {
          when {
            expression { env.RUN_MEDIA_SERVICE == 'true' }
          }
          steps {
            container('kaniko-media') {
              withCredentials([usernamePassword(credentialsId: 'github-ghcr', usernameVariable: 'GHCR_USER', passwordVariable: 'GHCR_TOKEN')]) {
                sh '''
                  set -eu
                  JAR_COUNT="$(find "$WORKSPACE/backend/media-service/build/libs" -maxdepth 1 -name "*.jar" | wc -l | tr -d " ")"
                  if [ "$JAR_COUNT" != "1" ]; then
                    echo "Expected exactly one media-service bootJar, found $JAR_COUNT"
                    find "$WORKSPACE/backend/media-service/build/libs" -maxdepth 1 -type f -print || true
                    exit 1
                  fi
                  ls -lh "$WORKSPACE/backend/media-service/build/libs"/*.jar
                  mkdir -p /kaniko/.docker
                  AUTH="$(printf "%s:%s" "$GHCR_USER" "$GHCR_TOKEN" | base64 | tr -d '\\n')"
                  cat > /kaniko/.docker/config.json <<EOF
{"auths":{"ghcr.io":{"auth":"$AUTH"}}}
EOF
                  /kaniko/executor \
                    --context "$WORKSPACE/backend" \
                    --dockerfile "$WORKSPACE/backend/media-service/Dockerfile" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${MEDIA_IMAGE_NAME}:${GIT_COMMIT}" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${MEDIA_IMAGE_NAME}:${BUILD_LABEL}" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${MEDIA_IMAGE_NAME}:dev"
                '''
              }
            }
          }
        }

        stage('Build and push payment service image') {
          when {
            expression { env.RUN_PAYMENT_SERVICE == 'true' }
          }
          steps {
            container('kaniko-payment') {
              withCredentials([usernamePassword(credentialsId: 'github-ghcr', usernameVariable: 'GHCR_USER', passwordVariable: 'GHCR_TOKEN')]) {
                sh '''
                  set -eu
                  JAR_COUNT="$(find "$WORKSPACE/backend/payment-service/build/libs" -maxdepth 1 -name "*.jar" | wc -l | tr -d " ")"
                  if [ "$JAR_COUNT" != "1" ]; then
                    echo "Expected exactly one payment-service bootJar, found $JAR_COUNT"
                    find "$WORKSPACE/backend/payment-service/build/libs" -maxdepth 1 -type f -print || true
                    exit 1
                  fi
                  ls -lh "$WORKSPACE/backend/payment-service/build/libs"/*.jar
                  for INCLUDE in '!payment-service/build/' '!payment-service/build/libs/' '!payment-service/build/libs/*.jar'; do
                    if ! grep -Fxq "$INCLUDE" "$WORKSPACE/backend/.dockerignore"; then
                      echo "payment-service bootJar is not included in the backend Docker context: missing $INCLUDE"
                      exit 1
                    fi
                  done
                  mkdir -p /kaniko/.docker
                  AUTH="$(printf "%s:%s" "$GHCR_USER" "$GHCR_TOKEN" | base64 | tr -d '\\n')"
                  cat > /kaniko/.docker/config.json <<EOF
{"auths":{"ghcr.io":{"auth":"$AUTH"}}}
EOF
                  /kaniko/executor \
                    --context "$WORKSPACE/backend" \
                    --dockerfile "$WORKSPACE/backend/payment-service/Dockerfile" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${PAYMENT_IMAGE_NAME}:${GIT_COMMIT}" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${PAYMENT_IMAGE_NAME}:${BUILD_LABEL}" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${PAYMENT_IMAGE_NAME}:dev"
                '''
              }
            }
          }
        }

        stage('Build and push registration service image') {
          when {
            expression { env.RUN_REGISTRATION_SERVICE == 'true' }
          }
          steps {
            container('kaniko-registration') {
              withCredentials([usernamePassword(credentialsId: 'github-ghcr', usernameVariable: 'GHCR_USER', passwordVariable: 'GHCR_TOKEN')]) {
                sh '''
                  set -eu
                  JAR_COUNT="$(find "$WORKSPACE/backend/registration-service/build/libs" -maxdepth 1 -name "*.jar" | wc -l | tr -d " ")"
                  if [ "$JAR_COUNT" != "1" ]; then
                    echo "Expected exactly one registration-service bootJar, found $JAR_COUNT"
                    find "$WORKSPACE/backend/registration-service/build/libs" -maxdepth 1 -type f -print || true
                    exit 1
                  fi
                  ls -lh "$WORKSPACE/backend/registration-service/build/libs"/*.jar
                  for INCLUDE in '!registration-service/build/' '!registration-service/build/libs/' '!registration-service/build/libs/*.jar'; do
                    if ! grep -Fxq "$INCLUDE" "$WORKSPACE/backend/.dockerignore"; then
                      echo "registration-service bootJar is not included in the backend Docker context: missing $INCLUDE"
                      exit 1
                    fi
                  done
                  mkdir -p /kaniko/.docker
                  AUTH="$(printf "%s:%s" "$GHCR_USER" "$GHCR_TOKEN" | base64 | tr -d '\\n')"
                  cat > /kaniko/.docker/config.json <<EOF
{"auths":{"ghcr.io":{"auth":"$AUTH"}}}
EOF
                  /kaniko/executor \
                    --context "$WORKSPACE/backend" \
                    --dockerfile "$WORKSPACE/backend/registration-service/Dockerfile" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${REGISTRATION_IMAGE_NAME}:${GIT_COMMIT}" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${REGISTRATION_IMAGE_NAME}:${BUILD_LABEL}" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${REGISTRATION_IMAGE_NAME}:dev"
                '''
              }
            }
          }
        }

        stage('Build and push email service image') {
          when {
            expression { env.RUN_EMAIL_SERVICE == 'true' }
          }
          steps {
            container('kaniko-email') {
              withCredentials([usernamePassword(credentialsId: 'github-ghcr', usernameVariable: 'GHCR_USER', passwordVariable: 'GHCR_TOKEN')]) {
                sh '''
                  set -eu
                  JAR_COUNT="$(find "$WORKSPACE/backend/email-service/build/libs" -maxdepth 1 -name "*.jar" | wc -l | tr -d " ")"
                  if [ "$JAR_COUNT" != "1" ]; then
                    echo "Expected exactly one email-service bootJar, found $JAR_COUNT"
                    find "$WORKSPACE/backend/email-service/build/libs" -maxdepth 1 -type f -print || true
                    exit 1
                  fi
                  ls -lh "$WORKSPACE/backend/email-service/build/libs"/*.jar
                  for INCLUDE in '!email-service/build/' '!email-service/build/libs/' '!email-service/build/libs/*.jar'; do
                    if ! grep -Fxq "$INCLUDE" "$WORKSPACE/backend/.dockerignore"; then
                      echo "email-service bootJar is not included in the backend Docker context: missing $INCLUDE"
                      exit 1
                    fi
                  done
                  mkdir -p /kaniko/.docker
                  AUTH="$(printf "%s:%s" "$GHCR_USER" "$GHCR_TOKEN" | base64 | tr -d '\\n')"
                  cat > /kaniko/.docker/config.json <<EOF
{"auths":{"ghcr.io":{"auth":"$AUTH"}}}
EOF
                  /kaniko/executor \
                    --context "$WORKSPACE/backend" \
                    --dockerfile "$WORKSPACE/backend/email-service/Dockerfile" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${EMAIL_IMAGE_NAME}:${GIT_COMMIT}" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${EMAIL_IMAGE_NAME}:${BUILD_LABEL}" \
                    --destination "ghcr.io/${GITHUB_OWNER}/${EMAIL_IMAGE_NAME}:dev"
                '''
              }
            }
          }
        }
      }
    }

    stage('Tag source commit') {
      when {
        expression { env.DEPLOY_TO_DEV == 'true' && env.RUN_ANY_TARGET == 'true' }
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
        expression { env.DEPLOY_TO_DEV == 'true' && env.RUN_ANY_TARGET == 'true' }
      }
      steps {
        container('tools') {
          withCredentials([usernamePassword(credentialsId: 'github-infra-token', usernameVariable: 'GITHUB_USER', passwordVariable: 'GITHUB_TOKEN')]) {
            sh '''
              set -eu
              apk add --no-cache git yq
              AUTH_REPO="$(echo "$INFRA_REPO" | sed "s#https://#https://${GITHUB_USER}:${GITHUB_TOKEN}@#")"
              update_values() {
                changed_files=""
                if [ "$RUN_API_GATEWAY" = "true" ]; then
                  yq -i ".image.tag = strenv(BUILD_LABEL) | .build.name = strenv(BUILD_LABEL) | .build.number = strenv(BUILD_NUMBER) | .build.branch = strenv(CI_BRANCH) | .build.branchLabel = strenv(BUILD_LABEL_PREFIX) | .build.commit = strenv(GIT_COMMIT) | .build.commitShort = strenv(GIT_COMMIT_SHORT)" helm-charts/api-gateway/values-dev.yaml
                  changed_files="$changed_files helm-charts/api-gateway/values-dev.yaml"
                fi
                if [ "$RUN_WEB_APP" = "true" ]; then
                  yq -i ".image.tag = strenv(BUILD_LABEL) | .build.name = strenv(BUILD_LABEL) | .build.number = strenv(BUILD_NUMBER) | .build.branch = strenv(CI_BRANCH) | .build.branchLabel = strenv(BUILD_LABEL_PREFIX) | .build.commit = strenv(GIT_COMMIT) | .build.commitShort = strenv(GIT_COMMIT_SHORT)" helm-charts/web-app/values-dev.yaml
                  changed_files="$changed_files helm-charts/web-app/values-dev.yaml"
                fi
                if [ "$RUN_COLLABORATION_SERVICE" = "true" ]; then
                  yq -i ".image.tag = strenv(BUILD_LABEL) | .build.name = strenv(BUILD_LABEL) | .build.number = strenv(BUILD_NUMBER) | .build.branch = strenv(CI_BRANCH) | .build.branchLabel = strenv(BUILD_LABEL_PREFIX) | .build.commit = strenv(GIT_COMMIT) | .build.commitShort = strenv(GIT_COMMIT_SHORT)" helm-charts/collaboration-service/values-dev.yaml
                  changed_files="$changed_files helm-charts/collaboration-service/values-dev.yaml"
                fi
                if [ "$RUN_MEDIA_SERVICE" = "true" ]; then
                  yq -i ".image.tag = strenv(BUILD_LABEL) | .build.name = strenv(BUILD_LABEL) | .build.number = strenv(BUILD_NUMBER) | .build.branch = strenv(CI_BRANCH) | .build.branchLabel = strenv(BUILD_LABEL_PREFIX) | .build.commit = strenv(GIT_COMMIT) | .build.commitShort = strenv(GIT_COMMIT_SHORT)" helm-charts/media-service/values-dev.yaml
                  changed_files="$changed_files helm-charts/media-service/values-dev.yaml"
                fi
                if [ "$RUN_PAYMENT_SERVICE" = "true" ]; then
                  yq -i ".image.tag = strenv(BUILD_LABEL) | .build.name = strenv(BUILD_LABEL) | .build.number = strenv(BUILD_NUMBER) | .build.branch = strenv(CI_BRANCH) | .build.branchLabel = strenv(BUILD_LABEL_PREFIX) | .build.commit = strenv(GIT_COMMIT) | .build.commitShort = strenv(GIT_COMMIT_SHORT)" helm-charts/payment-service/values-dev.yaml
                  changed_files="$changed_files helm-charts/payment-service/values-dev.yaml"
                fi
                if [ "$RUN_REGISTRATION_SERVICE" = "true" ]; then
                  yq -i ".image.tag = strenv(BUILD_LABEL) | .build.name = strenv(BUILD_LABEL) | .build.number = strenv(BUILD_NUMBER) | .build.branch = strenv(CI_BRANCH) | .build.branchLabel = strenv(BUILD_LABEL_PREFIX) | .build.commit = strenv(GIT_COMMIT) | .build.commitShort = strenv(GIT_COMMIT_SHORT)" helm-charts/registration-service/values-dev.yaml
                  changed_files="$changed_files helm-charts/registration-service/values-dev.yaml"
                fi
                if [ "$RUN_EMAIL_SERVICE" = "true" ]; then
                  yq -i ".image.tag = strenv(BUILD_LABEL) | .build.name = strenv(BUILD_LABEL) | .build.number = strenv(BUILD_NUMBER) | .build.branch = strenv(CI_BRANCH) | .build.branchLabel = strenv(BUILD_LABEL_PREFIX) | .build.commit = strenv(GIT_COMMIT) | .build.commitShort = strenv(GIT_COMMIT_SHORT)" helm-charts/email-service/values-dev.yaml
                  changed_files="$changed_files helm-charts/email-service/values-dev.yaml"
                fi
                git add $changed_files
              }

              for attempt in 1 2 3 4 5; do
                rm -rf infra
                git clone --branch "$INFRA_BRANCH" "$AUTH_REPO" infra
                cd infra
                git config user.email "jenkins@play-and-say.ru"
                git config user.name "Play&Say Jenkins"
                update_values
                if git diff --cached --quiet; then
                  echo "No dev image tag changes for ${BUILD_LABEL}"
                  exit 0
                fi
                git commit \
                  -m "chore: deploy ${BUILD_LABEL} to dev" \
                  -m "Source branch: ${CI_BRANCH}" \
                  -m "Source commit: ${GIT_COMMIT}"
                git pull --rebase origin "$INFRA_BRANCH"
                if git push origin "HEAD:${INFRA_BRANCH}"; then
                  if git ls-remote --exit-code --tags origin "refs/tags/${BUILD_LABEL}" >/dev/null 2>&1; then
                    echo "Infra tag ${BUILD_LABEL} already exists"
                  else
                    git tag -a "$BUILD_LABEL" \
                      -m "Play&Say dev deployment ${BUILD_LABEL}" \
                      -m "Source branch: ${CI_BRANCH}" \
                      -m "Source commit: ${GIT_COMMIT}"
                    git push origin "refs/tags/${BUILD_LABEL}"
                  fi
                  exit 0
                fi
                cd ..
                echo "Infra push race for ${BUILD_LABEL}; retrying ${attempt}/5"
                sleep $((attempt * 3))
              done
              echo "Could not push dev image tag update for ${BUILD_LABEL} after retries"
              exit 1
            '''
          }
        }
      }
    }

    stage('Wait for dev rollout') {
      when {
        expression { env.DEPLOY_TO_DEV == 'true' && env.RUN_ANY_TARGET == 'true' }
      }
      steps {
        container('tools') {
          echo "Waiting for dev rollout ${env.BUILD_LABEL} before smoke"
          sh '''
            set -eu
            apk add --no-cache jq kubectl

            EXPECTED_BUILD="$BUILD_LABEL"
            TIMEOUT_SECONDS="${PLAYSAY_DEV_ROLLOUT_TIMEOUT_SECONDS:-420}"
            POLL_SECONDS="${PLAYSAY_DEV_ROLLOUT_POLL_SECONDS:-10}"
            APPS=""
            if [ "$RUN_API_GATEWAY" = "true" ]; then APPS="$APPS api-gateway"; fi
            if [ "$RUN_WEB_APP" = "true" ]; then APPS="$APPS web-app"; fi
            if [ "$RUN_COLLABORATION_SERVICE" = "true" ]; then APPS="$APPS collaboration-service"; fi
            if [ "$RUN_MEDIA_SERVICE" = "true" ]; then APPS="$APPS media-service"; fi
            if [ "$RUN_PAYMENT_SERVICE" = "true" ]; then APPS="$APPS payment-service"; fi
            if [ "$RUN_REGISTRATION_SERVICE" = "true" ]; then APPS="$APPS registration-service"; fi
            if [ "$RUN_EMAIL_SERVICE" = "true" ]; then APPS="$APPS email-service"; fi
            DEADLINE="$(( $(date +%s) + TIMEOUT_SECONDS ))"

            kubectl -n argocd annotate application $APPS argocd.argoproj.io/refresh=hard --overwrite

            while true; do
              all_ready="true"
              echo "Checking dev rollout for ${EXPECTED_BUILD}"

              for app in $APPS; do
                sync_status="$(kubectl -n argocd get application "$app" -o jsonpath='{.status.sync.status}' 2>/dev/null || true)"
                health_status="$(kubectl -n argocd get application "$app" -o jsonpath='{.status.health.status}' 2>/dev/null || true)"
                deployment_json="$(kubectl -n playsay-dev get deployment "$app" -o json 2>/dev/null || true)"

                if [ -z "$deployment_json" ]; then
                  echo "  ${app}: deployment is not visible yet"
                  all_ready="false"
                  continue
                fi

                deploy_build="$(printf "%s" "$deployment_json" | jq -r '.spec.template.metadata.labels["playsay.io/build-name"] // ""')"
                desired="$(printf "%s" "$deployment_json" | jq -r '.spec.replicas // 1')"
                updated="$(printf "%s" "$deployment_json" | jq -r '.status.updatedReplicas // 0')"
                ready="$(printf "%s" "$deployment_json" | jq -r '.status.readyReplicas // 0')"
                available="$(printf "%s" "$deployment_json" | jq -r '.status.availableReplicas // 0')"
                ready_pods="$(kubectl -n playsay-dev get pods -l "app.kubernetes.io/name=${app},playsay.io/build-name=${EXPECTED_BUILD}" -o json \
                  | jq -r '[.items[] | select(.status.phase == "Running") | select((.status.containerStatuses // []) | length > 0) | select([.status.containerStatuses[]?.ready] | all)] | length')"

                echo "  ${app}: argocd=${sync_status}/${health_status} build=${deploy_build} replicas updated=${updated} ready=${ready} available=${available} expected=${desired} readyPods=${ready_pods}"

                if [ "$sync_status" != "Synced" ] ||
                   [ "$health_status" != "Healthy" ] ||
                   [ "$deploy_build" != "$EXPECTED_BUILD" ] ||
                   [ "$updated" -lt "$desired" ] ||
                   [ "$ready" -lt "$desired" ] ||
                   [ "$available" -lt "$desired" ] ||
                   [ "$ready_pods" -lt "$desired" ]; then
                  all_ready="false"
                fi
              done

              if [ "$all_ready" = "true" ]; then
                echo "Dev rollout ${EXPECTED_BUILD} is ready"
                exit 0
              fi

              if [ "$(date +%s)" -ge "$DEADLINE" ]; then
                echo "Timed out waiting for dev rollout ${EXPECTED_BUILD}"
                kubectl -n argocd get applications $APPS \
                  -o custom-columns=NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,REV:.status.sync.revision || true
                kubectl -n playsay-dev get deployments $APPS \
                  -o custom-columns=NAME:.metadata.name,BUILD:.spec.template.metadata.labels.playsay\\.io/build-name,UPDATED:.status.updatedReplicas,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas || true
                kubectl -n playsay-dev get pods --show-labels || true
                exit 1
              fi

              sleep "$POLL_SECONDS"
            done
          '''
        }
      }
    }

    stage('Sprint 5 UI smoke') {
      when {
        expression { env.DEPLOY_TO_DEV == 'true' && (env.RUN_API_GATEWAY == 'true' || env.RUN_WEB_APP == 'true' || env.RUN_COLLABORATION_SERVICE == 'true') }
      }
      steps {
        container('smoke') {
          echo "Running Sprint 5 UI smoke against dev for ${env.BUILD_LABEL}"
          sh '''
            set -eu

            missing=""
            for name in PLAY_SAY_SMOKE_TEACHER_PASSWORD PLAY_SAY_SMOKE_STUDENT_A_PASSWORD PLAY_SAY_SMOKE_STUDENT_B_PASSWORD; do
              value="$(printenv "$name" || true)"
              if [ -z "$value" ]; then
                missing="$missing $name"
              fi
            done
            if [ -n "$missing" ]; then
              echo "Missing Jenkins smoke secret env:$missing"
              echo "Sync the keycloak-dev-users Kubernetes secret into the jenkins namespace before running the smoke stage."
              exit 1
            fi

            export PLAY_SAY_SMOKE_FETCH_PASSWORDS=false
            export PLAY_SAY_SMOKE_WEB_BASE_URL="${PLAY_SAY_SMOKE_WEB_BASE_URL:-https://online.play-and-say.ru}"
            export PLAY_SAY_SMOKE_API_BASE_URL="${PLAY_SAY_SMOKE_API_BASE_URL:-https://online.play-and-say.ru/api}"
            export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

            SMOKE_NODE_DIR="/tmp/playsay-ui-smoke"
            if [ ! -d "$SMOKE_NODE_DIR/node_modules/playwright" ]; then
              rm -rf "$SMOKE_NODE_DIR"
              mkdir -p "$SMOKE_NODE_DIR"
              cat > "$SMOKE_NODE_DIR/package.json" <<'JSON'
{"private":true,"dependencies":{"playwright":"1.56.1"}}
JSON
              npm --prefix "$SMOKE_NODE_DIR" install --cache /cache/npm --prefer-offline --ignore-scripts --no-audit --no-fund
            fi
            export PLAYWRIGHT_PACKAGE_DIR="$SMOKE_NODE_DIR"

            attempt=1
            while [ "$attempt" -le 6 ]; do
              echo "Sprint 5 UI smoke attempt $attempt/6"
              if ./scripts/smoke/sprint5-ui-smoke.mjs; then
                exit 0
              fi
              if [ "$attempt" -eq 6 ]; then
                exit 1
              fi
              attempt=$((attempt + 1))
              sleep 30
            done
          '''
        }
      }
    }

    stage('Sprint 6 Homework smoke') {
      when {
        expression { env.DEPLOY_TO_DEV == 'true' && (env.RUN_API_GATEWAY == 'true' || env.RUN_WEB_APP == 'true') }
      }
      steps {
        container('smoke') {
          echo "Running Sprint 6 homework smoke against dev for ${env.BUILD_LABEL}"
          sh '''
            set -eu

            missing=""
            for name in PLAY_SAY_SMOKE_TEACHER_PASSWORD PLAY_SAY_SMOKE_STUDENT_A_PASSWORD PLAY_SAY_SMOKE_STUDENT_B_PASSWORD; do
              value="$(printenv "$name" || true)"
              if [ -z "$value" ]; then
                missing="$missing $name"
              fi
            done
            if [ -n "$missing" ]; then
              echo "Missing Jenkins smoke secret env:$missing"
              echo "Sync the keycloak-dev-users Kubernetes secret into the jenkins namespace before running the smoke stage."
              exit 1
            fi

            export PLAY_SAY_SMOKE_FETCH_PASSWORDS=false
            export PLAY_SAY_SMOKE_WEB_BASE_URL="${PLAY_SAY_SMOKE_WEB_BASE_URL:-https://online.play-and-say.ru}"
            export PLAY_SAY_SMOKE_API_BASE_URL="${PLAY_SAY_SMOKE_API_BASE_URL:-https://online.play-and-say.ru/api}"
            export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

            SMOKE_NODE_DIR="/tmp/playsay-ui-smoke"
            if [ ! -d "$SMOKE_NODE_DIR/node_modules/playwright" ]; then
              rm -rf "$SMOKE_NODE_DIR"
              mkdir -p "$SMOKE_NODE_DIR"
              cat > "$SMOKE_NODE_DIR/package.json" <<'JSON'
{"private":true,"dependencies":{"playwright":"1.56.1"}}
JSON
              npm --prefix "$SMOKE_NODE_DIR" install --cache /cache/npm --prefer-offline --ignore-scripts --no-audit --no-fund
            fi
            export PLAYWRIGHT_PACKAGE_DIR="$SMOKE_NODE_DIR"

            attempt=1
            while [ "$attempt" -le 3 ]; do
              echo "Sprint 6 homework smoke attempt $attempt/3"
              if ./scripts/smoke/sprint6-homework-smoke.mjs; then
                exit 0
              fi
              if [ "$attempt" -eq 3 ]; then
                exit 1
              fi
              attempt=$((attempt + 1))
              sleep 30
            done
          '''
        }
      }
    }
  }

  post {
    always {
      script {
        if (fileExists('scripts/ci/manage-build-capacity.sh')) {
          try {
            container('tools') {
              sh 'command -v kubectl >/dev/null 2>&1 || apk add --no-cache jq kubectl; CI_BUILD_ID="${JOB_NAME}-${BUILD_NUMBER}" ./scripts/ci/manage-build-capacity.sh restore'
            }
          } catch (err) {
            echo "Capacity restore deferred to watchdog: ${err}"
          }
        }
      }
      echo "Build ${env.BUILD_LABEL ?: env.BUILD_NUMBER} finished with ${currentBuild.currentResult}"
    }
  }
}
