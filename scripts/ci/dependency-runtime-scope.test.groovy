import groovy.json.JsonSlurper

def root = new File(args[0])
def rules = new JsonSlurper().parse(new File(root, 'backend/gradle/dependency-security-runtime-scope.json')).rules
def classify = new GroovyShell().evaluate(new File(root, 'backend/gradle/dependency-security-runtime-scope.gradle'))
int checks = 0
rules.findAll { !it.kind }.each { r ->
    def dep = [fileName: r.parentFile + ' (shaded: fixture)', sha256: r.sha256,
               packages: [[id: r.packageUrl]], projectReferences: ['keycloak-lesson-authenticator:serverAugmentation']]
    def configs = [serverAugmentation: [[coordinate: r.parentCoordinate, file: r.parentFile, sha256: r.parentSha256]], serverRuntime: []]
    assert classify(r.build, r.project, dep, r.cves[0], configs, rules)
    assert !classify(r.build, ':api-gateway', dep, r.cves[0], configs, rules)
    assert !classify(r.build, r.project, dep + [sha256: '0' * 64], r.cves[0], configs, rules)
    assert !classify(r.build, r.project, dep + [packages: [[id: r.packageUrl + '-changed']]], r.cves[0], configs, rules)
    assert !classify(r.build, r.project, dep + [projectReferences: []], r.cves[0], configs, rules)
    assert !classify(r.build, r.project, dep + [projectReferences: ['keycloak-lesson-authenticator:serverRuntime']], r.cves[0], configs, rules)
    assert !classify(r.build, r.project, dep, 'CVE-2099-99999', configs, rules)
    assert !classify(r.build, r.project, dep, r.cves[0], [serverAugmentation: []], rules)
    assert !classify(r.build, r.project, dep, r.cves[0], configs + [serverRuntime: configs.serverAugmentation], rules)
    assert !classify(r.build, r.project, dep + [fileName: 'httpclient5-5.5.1.jar'], r.cves[0], configs, rules)
    assert !classify(r.build, r.project, dep, r.cves[0], [serverAugmentation: [[coordinate: r.parentCoordinate, file: r.parentFile, sha256: '0' * 64]]], rules)
    assert !classify(r.build, r.project, dep, r.cves[0], [serverAugmentation: [[coordinate: r.parentCoordinate, file: r.parentFile, sha256: null, directory: true]]], rules)
    checks += 12
}
rules.findAll { it.kind == 'build-only-direct' }.each { r ->
    def purl = r.packageUrl =~ /^pkg:maven\/([^\/]+)\/([^@]+)@(.+)$/
    assert purl.matches()
    def coordinate = "${purl[0][1]}:${purl[0][2]}:${purl[0][3]}"
    def artifact = [coordinate: coordinate, file: r.file, sha256: r.sha256, directory: false]
    def configs = r.projectReferences.collectEntries { ref ->
        [(ref.substring((r.build + ':').length())): [artifact]]
    }
    def dep = [fileName: r.file, sha256: r.sha256, packages: [[id: r.packageUrl]],
               projectReferences: r.projectReferences.collect()]
    def safeRuntime = [build: 'playsay-backend', selection: 'api-gateway',
        discoveredProjects: [':api-gateway'], modules: [[project: ':api-gateway',
            configurations: [[name: 'runtimeClasspath', artifacts: []]]]]]
    assert classify(r.build, r.project, dep, r.cves[0], configs, rules, safeRuntime)
    assert !classify(r.build, ':api-gateway', dep, r.cves[0], configs, rules, safeRuntime)
    assert !classify(r.build, r.project, dep + [sha256: '0' * 64], r.cves[0], configs, rules, safeRuntime)
    assert !classify(r.build, r.project, dep + [fileName: 'other.jar'], r.cves[0], configs, rules, safeRuntime)
    assert !classify(r.build, r.project, dep + [packages: [[id: r.packageUrl + '-changed']]], r.cves[0], configs, rules, safeRuntime)
    assert !classify(r.build, r.project, dep + [projectReferences: []], r.cves[0], configs, rules, safeRuntime)
    assert !classify(r.build, r.project, dep, 'CVE-2099-99999', configs, rules, safeRuntime)
    assert !classify(r.build, r.project, dep, r.cves[0], [:], rules, safeRuntime)
    assert !classify(r.build, r.project, dep, r.cves[0], configs, rules, null)
    assert !classify(r.build, r.project, dep, r.cves[0], configs, rules, safeRuntime + [modules: []])
    def missingSelected = safeRuntime + [selection: 'keyboard-service']
    assert !classify(r.build, r.project, dep, r.cves[0], configs, rules, missingSelected)
    def incompleteAll = safeRuntime + [selection: 'all', discoveredProjects: [':api-gateway', ':keyboard-service']]
    assert !classify(r.build, r.project, dep, r.cves[0], configs, rules, incompleteAll)
    def missingRuntime = safeRuntime + [modules: [[project: ':api-gateway', configurations: []]]]
    assert !classify(r.build, r.project, dep, r.cves[0], configs, rules, missingRuntime)
    def shipped = safeRuntime + [modules: [[project: ':api-gateway',
        configurations: [[name: 'runtimeClasspath', artifacts: [artifact]]]]]]
    assert !classify(r.build, r.project, dep, r.cves[0], configs, rules, shipped)
    def sameCoordinate = safeRuntime + [modules: [[project: ':api-gateway',
        configurations: [[name: 'runtimeClasspath', artifacts: [artifact + [sha256: '1' * 64]]]]]]]
    assert !classify(r.build, r.project, dep, r.cves[0], configs, rules, sameCoordinate)
    def sameBytes = safeRuntime + [modules: [[project: ':api-gateway',
        configurations: [[name: 'runtimeClasspath', artifacts: [artifact + [coordinate: 'other:other:1']]]]]]]
    assert !classify(r.build, r.project, dep, r.cves[0], configs, rules, sameBytes)
    def unknown = safeRuntime + [modules: [[project: ':api-gateway',
        configurations: [[name: 'runtimeClasspath', artifacts: [[coordinate: 'x:y:1', sha256: null]]]]]]]
    assert !classify(r.build, r.project, dep, r.cves[0], configs, rules, unknown)
    def keycloakMissingServer = safeRuntime + [selection: 'keycloak-lesson-authenticator',
        modules: [[project: ':keycloak-lesson-authenticator',
            configurations: [[name: 'runtimeClasspath', artifacts: []]]]]]
    assert !classify(r.build, r.project, dep, r.cves[0], configs, rules, keycloakMissingServer)
    checks += 18
}
rules.findAll { it.kind == 'build-only-detekt' }.each { r ->
    def purl = r.packageUrl =~ /^pkg:maven\/([^\/]+)\/([^@]+)@(.+)$/
    assert purl.matches()
    def coordinate = "${purl[0][1]}:${purl[0][2]}:${purl[0][3]}"
    def artifact = [coordinate: coordinate, file: r.file, sha256: r.sha256, directory: false]
    def configs = [detekt: [artifact]]
    r.projects.each { project ->
        def dep = [fileName: r.file, sha256: r.sha256, packages: [[id: r.packageUrl]],
                   projectReferences: [project.substring(1) + ':detekt']]
        def coverage = [build: 'playsay-backend', selection: project.substring(1),
            discoveredProjects: [project], modules: [[project: project,
                configurations: [[name: 'runtimeClasspath', artifacts: []]]]]]
        assert classify(r.build, project, dep, r.cves[0], configs, rules, coverage)
        assert !classify(r.build, ':other-service', dep, r.cves[0], configs, rules, coverage)
        assert !classify(r.build, project, dep + [sha256: '0' * 64], r.cves[0], configs, rules, coverage)
        assert !classify(r.build, project, dep + [projectReferences: [project.substring(1) + ':runtimeClasspath']], r.cves[0], configs, rules, coverage)
        assert !classify(r.build, project, dep, 'CVE-2099-99999', configs, rules, coverage)
        assert !classify(r.build, project, dep, r.cves[0], [:], rules, coverage)
        assert !classify(r.build, project, dep, r.cves[0], configs, rules, null)
        def shipped = coverage + [modules: [[project: project,
            configurations: [[name: 'runtimeClasspath', artifacts: [artifact]]]]]]
        assert !classify(r.build, project, dep, r.cves[0], configs, rules, shipped)
        def missingProject = coverage + [selection: 'other-service',
            modules: [[project: ':other-service', configurations: [[name: 'runtimeClasspath', artifacts: []]]]]]
        assert !classify(r.build, project, dep, r.cves[0], configs, rules, missingProject)
        checks += 9
    }
}
def expectedBuildOnly = rules.findAll { it.kind in ['build-only-direct', 'build-only-detekt'] }.collect { it.sha256 }.toSet()
def imageBoundary = new File(root, 'backend/keycloak-lesson-authenticator/server-runtime/build-only-risk-sha256.txt')
    .readLines().collect { it.trim() }.findAll { it && !it.startsWith('#') }.toSet()
assert !expectedBuildOnly.empty && imageBoundary == expectedBuildOnly
checks++
println "Runtime scope checks: ${checks} passed"
