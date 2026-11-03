import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.jar.JarFile;

/** Fail image construction unless the complete packaged Vert.x family is patched. */
class VerifyVertx {
    public static void main(String[] args) throws Exception {
        Set<String> remaining = new TreeSet<>(List.of(
                "vertx-auth-common", "vertx-bridge-common", "vertx-codegen", "vertx-core",
                "vertx-grpc", "vertx-grpc-client", "vertx-grpc-common", "vertx-grpc-server",
                "vertx-uri-template", "vertx-web", "vertx-web-client", "vertx-web-common"));
        try (var paths = Files.list(Path.of(args[0]))) {
            for (Path path : paths.filter(p -> p.getFileName().toString().startsWith("io.vertx.")
                    && p.toString().endsWith(".jar")).sorted().toList()) {
                try (var jar = new JarFile(path.toFile())) {
                    var metadata = jar.stream().filter(e -> e.getName().startsWith("META-INF/maven/io.vertx/")
                            && e.getName().endsWith("/pom.properties")).toList();
                    if (metadata.size() != 1) throw new IllegalStateException("Missing/ambiguous Vert.x metadata: " + path);
                    var properties = new Properties();
                    try (var input = jar.getInputStream(metadata.get(0))) { properties.load(input); }
                    String artifact = properties.getProperty("artifactId");
                    String version = properties.getProperty("version");
                    if (!"io.vertx".equals(properties.getProperty("groupId")) || !remaining.remove(artifact)) {
                        throw new IllegalStateException("Unexpected or duplicate Vert.x artifact: " + artifact);
                    }
                    if (!"4.5.35".equals(version)) throw new IllegalStateException("Unexpected Vert.x version: " + artifact + " " + version);
                    String sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)));
                    System.out.println(artifact + "\t" + version + "\t" + path.getFileName() + "\t" + sha);
                }
            }
        }
        if (!remaining.isEmpty()) throw new IllegalStateException("Incomplete Vert.x runtime: " + remaining);
    }
}
