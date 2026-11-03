package com.playsay.keycloak;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class VertxRuntimeVerificationTest {
    private static final List<String> ARTIFACTS = List.of(
            "vertx-auth-common", "vertx-bridge-common", "vertx-codegen", "vertx-core",
            "vertx-grpc", "vertx-grpc-client", "vertx-grpc-common", "vertx-grpc-server",
            "vertx-uri-template", "vertx-web", "vertx-web-client", "vertx-web-common");

    @TempDir Path directory;

    @Test
    void acceptsOnlyCompleteUniquePatchedMavenMetadata() throws Exception {
        for (String artifact : ARTIFACTS) writeJar(jar(artifact), artifact, "4.5.35");
        assertEquals(0, verify());

        // The filename remains patched-looking: the embedded metadata must win.
        writeJar(jar("vertx-core"), "vertx-core", "4.5.34");
        assertNotEquals(0, verify());
        writeJar(jar("vertx-core"), "vertx-core", "4.5.35");

        Files.delete(jar("vertx-web"));
        assertNotEquals(0, verify());
        writeJar(jar("vertx-web"), "vertx-web", "4.5.35");

        Files.copy(jar("vertx-core"), directory.resolve("io.vertx.duplicate.jar"));
        assertNotEquals(0, verify());
    }

    private Path jar(String artifact) {
        return directory.resolve("io.vertx." + artifact + "-4.5.35.jar");
    }

    private void writeJar(Path file, String artifact, String version) throws IOException {
        try (var output = new JarOutputStream(Files.newOutputStream(file))) {
            output.putNextEntry(new JarEntry("META-INF/maven/io.vertx/" + artifact + "/pom.properties"));
            output.write(("groupId=io.vertx\nartifactId=" + artifact + "\nversion=" + version + "\n")
                    .getBytes(StandardCharsets.UTF_8));
            output.closeEntry();
        }
    }

    private int verify() throws Exception {
        Path javaExecutable = Path.of(System.getProperty("java.home"), "bin", "java");
        Path source = Path.of("server-runtime", "VerifyVertx.java").toAbsolutePath();
        Process process = new ProcessBuilder(javaExecutable.toString(), source.toString(), directory.toString())
                .redirectErrorStream(true).start();
        process.getInputStream().transferTo(java.io.OutputStream.nullOutputStream());
        return process.waitFor();
    }
}
