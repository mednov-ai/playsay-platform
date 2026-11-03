import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import java.util.jar.JarFile;

/** Require a coordinated Vert.x family in the actual packaged Keycloak runtime. */
class VerifyVertx {
    public static void main(String[] args) throws Exception {
        Set<String> required = new HashSet<>(List.of("vertx-core", "vertx-auth-common", "vertx-web", "vertx-grpc"));
        int count = 0;
        try (var paths = Files.list(Path.of(args[0]))) {
            for (Path path : paths.filter(p -> p.getFileName().toString().startsWith("io.vertx.")
                    && p.toString().endsWith(".jar")).sorted().toList()) {
                try (var jar = new JarFile(path.toFile())) {
                    var metadata = jar.stream().filter(e -> e.getName().startsWith("META-INF/maven/io.vertx/")
                            && e.getName().endsWith("/pom.properties")).toList();
                    if (metadata.size() != 1) throw new IllegalStateException("Missing/ambiguous Vert.x metadata: " + path);
                    var properties = new Properties();
                    try (var input = jar.getInputStream(metadata.get(0))) {
                        properties.load(input);
                    }
                    String artifact = properties.getProperty("artifactId");
                    String version = properties.getProperty("version");
                    if (!"4.5.35".equals(version)) throw new IllegalStateException("Unexpected Vert.x version: " + artifact + " " + version);
                    required.remove(artifact);
                    String sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)));
                    System.out.println(artifact + "\t" + version + "\t" + path.getFileName() + "\t" + sha);
                    count++;
                }
            }
        }
        if (count < 10 || !required.isEmpty()) throw new IllegalStateException("Incomplete Vert.x runtime: " + required);
    }
}
