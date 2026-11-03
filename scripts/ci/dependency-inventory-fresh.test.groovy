import groovy.json.JsonSlurper
import java.nio.file.Files
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

// Reproduce the clean-checkout ordering used by CI: a project dependency's
// runtime JAR does not exist until its producer task has run.
def repository = new File(args[0]).canonicalFile
def fixture = Files.createTempDirectory('playsay-inventory-fresh-').toFile()
try {
    new File(fixture, 'settings.gradle').text = "rootProject.name = 'playsay-backend'\ninclude 'app', 'library'\n"
    new File(fixture, 'build.gradle').text = """
allprojects { group = 'com.example'; version = '1.0' }
subprojects { apply plugin: 'java' }
project(':app') { dependencies { runtimeOnly project(':library') } }
"""
    new File(fixture, 'app').mkdirs()
    def source = new File(fixture, 'library/src/main/java/Fixture.java')
    source.parentFile.mkdirs()
    source.text = 'public class Fixture {}\n'
    def reports = new File(fixture, 'reports')
    def data = new File(fixture, 'data')
    reports.mkdirs()
    data.mkdirs()
    def output = new File(fixture, 'gradle.log')
    def init = new File(repository, 'backend/gradle/dependency-security.init.gradle')
    def builder = new ProcessBuilder('gradle', '-p', fixture.path, '-I', init.path,
        'dependencySecurityInventory', '--no-daemon', '--max-workers=1')
    builder.redirectErrorStream(true).redirectOutput(output)
    def environment = builder.environment()
    environment.put('DEPENDENCY_SECURITY_BUILD_ROOT', fixture.path)
    environment.put('DEPENDENCY_SECURITY_REPORT_DIR', reports.path)
    environment.put('DEPENDENCY_SECURITY_DATA_DIR', data.path)
    environment.put('DEPENDENCY_SECURITY_MODULE', 'all')
    environment.remove('NVD_API_KEY')
    def process = builder.start()
    if (!process.waitFor(180, TimeUnit.SECONDS)) {
        process.destroyForcibly()
        throw new AssertionError('Fresh dependency inventory timed out')
    }
    assert process.exitValue() == 0 : output.text.takeRight(4000)
    def library = new File(fixture, 'library/build/libs/library-1.0.jar')
    assert library.isFile()
    def coverage = new JsonSlurper().parse(new File(reports, 'coverage.json'))
    def app = coverage.modules.find { it.project == ':app' }
    def runtime = app.configurations.find { it.name == 'runtimeClasspath' }
    def artifact = runtime.artifacts.find { it.coordinate == 'com.example:library:1.0' }
    def expected = MessageDigest.getInstance('SHA-256').digest(library.bytes).encodeHex().toString()
    assert artifact && !artifact.directory && artifact.sha256 == expected
    println 'Fresh dependency inventory built and hashed the project runtime JAR'
} finally {
    fixture.deleteDir()
}
