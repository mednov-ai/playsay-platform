pipeline {
  agent {
    kubernetes {
      yaml """
apiVersion: v1
kind: Pod
spec:
  activeDeadlineSeconds: 1800
  serviceAccountName: jenkins
  containers:
    - name: jnlp
      image: jenkins/inbound-agent:3383.vc8881d4b_0e76-1-jdk25
      resources:
        requests: {cpu: 50m, memory: 128Mi}
        limits: {cpu: 300m, memory: 384Mi}
    - name: tools
      image: alpine:3.20
      command: ["cat"]
      tty: true
      resources:
        requests: {cpu: 50m, memory: 64Mi}
        limits: {cpu: 300m, memory: 1536Mi}
"""
    }
  }
  options {
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
    timestamps()
    timeout(time: 30, unit: 'MINUTES')
  }
  parameters {
    string(name: 'BRANCH_NAME', defaultValue: '', trim: true)
    string(name: 'GITHUB_AFTER', defaultValue: '', trim: true)
    string(name: 'EXPECTED_INFRA_SHA', defaultValue: '', trim: true)
  }
  environment {
    PLATFORM_REPO = 'https://github.com/mednov-ai/playsay-platform.git'
    INFRA_REPO = 'https://github.com/mednov-ai/playsay-infra.git'
  }
  stages {
    stage('Verify and finalize exact release candidate') {
      steps {
        script {
          if (params.BRANCH_NAME != 'ci/hotfix-image-upload-413-infra-finalize' ||
              !(params.GITHUB_AFTER ==~ /^[0-9a-f]{40}$/) ||
              !(params.EXPECTED_INFRA_SHA ==~ /^[0-9a-f]{40}$/)) {
            error 'The verifier accepts only its CI-only branch and full reviewed SHAs.'
          }
          checkout([
            $class: 'GitSCM',
            branches: [[name: "*/${params.BRANCH_NAME}"]],
            doGenerateSubmoduleConfigurations: false,
            extensions: [], submoduleCfg: [],
            userRemoteConfigs: [[url: env.PLATFORM_REPO]]
          ])
          withEnv([
            "PROOF_SHA=${params.GITHUB_AFTER}",
            "EXPECTED_INFRA_SHA=${params.EXPECTED_INFRA_SHA}",
            'CI_BRANCH=release/01.007.24',
            'GIT_COMMIT=9bee01c9f0ff0ffc7dd5d4feeae8a73a8c8c10f0'
          ]) {
            container('tools') {
              withCredentials([usernamePassword(credentialsId: 'github-infra-token', usernameVariable: 'GITHUB_USER', passwordVariable: 'GITHUB_TOKEN')]) {
                sh '''
                  set -eu
                  apk add --no-cache git yq helm
                  git config --global --add safe.directory "$WORKSPACE"
                  test "$(git rev-parse HEAD)" = "$PROOF_SHA"
                  test "$(git rev-parse HEAD^)" = "$GIT_COMMIT"
                  git checkout --detach "$GIT_COMMIT"
                  test "$(git rev-parse HEAD)" = "$GIT_COMMIT"
                  test "$(git ls-remote --heads "$INFRA_REPO" "refs/heads/$CI_BRANCH" | cut -f1)" = "$EXPECTED_INFRA_SHA"
                  test "$(git ls-remote --heads "$PLATFORM_REPO" "refs/heads/$CI_BRANCH" | cut -f1)" = "$GIT_COMMIT"
                  ./scripts/ci/finalize-release-candidate.sh
                  test "$(git ls-remote --heads "$INFRA_REPO" "refs/heads/$CI_BRANCH" | cut -f1)" = "$EXPECTED_INFRA_SHA"
                  echo "Verified candidate $EXPECTED_INFRA_SHA for source $GIT_COMMIT"
                '''
              }
            }
          }
        }
      }
    }
  }
}
