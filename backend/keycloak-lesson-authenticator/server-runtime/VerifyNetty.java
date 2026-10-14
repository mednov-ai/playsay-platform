import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.jar.JarFile;

/** Verify real packaged Maven metadata, including native classifier JARs. */
class VerifyNetty {
    public static void main(String[] args) throws Exception {
        Set<String> required = new HashSet<>(List.of("netty-common", "netty-buffer", "netty-codec-http",
                "netty-codec-http2", "netty-codec-socks", "netty-handler", "netty-resolver-dns",
                "netty-transport", "netty-transport-native-epoll", "netty-transport-native-unix-common"));
        int count = 0;
        try (var paths = Files.list(Path.of(args[0]))) {
            for (Path path : paths.filter(p -> p.getFileName().toString().startsWith("io.netty.")
                    && p.toString().endsWith(".jar")).sorted().toList()) {
                try (var jar = new JarFile(path.toFile())) {
                    var metadata = jar.stream().filter(e -> e.getName().startsWith("META-INF/maven/io.netty/")
                            && e.getName().endsWith("/pom.properties")).toList();
                    if (metadata.size() != 1) throw new IllegalStateException("Missing/ambiguous Netty metadata: " + path);
                    var properties = new Properties();
                    try (var input = jar.getInputStream(metadata.get(0))) { properties.load(input); }
                    String artifact = properties.getProperty("artifactId");
                    String version = properties.getProperty("version");
                    String expected = artifact.startsWith("netty-tcnative") ? "2.0.84.Final" : "4.1.139.Final";
                    if (!expected.equals(version)) throw new IllegalStateException("Unexpected Netty version: " + artifact + " " + version);
                    required.remove(artifact);
                    String sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)));
                    System.out.println(artifact + "\t" + version + "\t" + path.getFileName() + "\t" + sha);
                    count++;
                }
            }
        }
        if (count < 18 || !required.isEmpty()) throw new IllegalStateException("Incomplete Netty runtime: " + required);
    }
}
