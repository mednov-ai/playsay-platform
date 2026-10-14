import groovy.json.JsonSlurper

def root = new File(args[0])
def rules = new JsonSlurper().parse(new File(root, 'backend/gradle/dependency-security-runtime-scope.json')).rules
def classify = new GroovyShell().evaluate(new File(root, 'backend/gradle/dependency-security-runtime-scope.gradle'))
int checks = 0
rules.each { r ->
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
println "Runtime scope checks: ${checks} passed"
