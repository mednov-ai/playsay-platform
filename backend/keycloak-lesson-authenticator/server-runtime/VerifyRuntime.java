import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.jar.JarFile;

/** Build fails if the excluded Docker/HTTP5 classes enter the server runtime. */
class VerifyRuntime {
    public static void main(String[] args) throws Exception {
        int count = 0;
        Path root = Path.of(args[0]);
        try (var paths = Files.walk(root.resolve("lib/main"))) {
            for (Path path : paths.filter(p -> p.toString().endsWith(".jar")).sorted().toList()) {
                try (var jar = new JarFile(path.toFile())) {
                    if (jar.stream().anyMatch(e -> e.getName().startsWith("com/github/dockerjava/") ||
                            e.getName().startsWith("com/github/dockerjava/zerodep/") ||
                            e.getName().startsWith("org/apache/hc/client5/") || e.getName().startsWith("org/apache/hc/core5/"))) {
                        throw new IllegalStateException("Outside-runtime artifact entered server runtime: " + path);
                    }
                }
                String sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)));
                System.out.println(sha + "  lib/" + root.relativize(path));
                count++;
            }
        }
        if (args.length > 1) {
            Path provider = Path.of(args[1]);
            try (var jar = new JarFile(provider.toFile())) {
                if (jar.stream().anyMatch(e -> e.getName().startsWith("com/github/dockerjava/") ||
                        e.getName().startsWith("org/apache/hc/client5/") || e.getName().startsWith("org/apache/hc/core5/"))) {
                    throw new IllegalStateException("Outside-runtime artifact entered provider: " + provider);
                }
            }
            String sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(provider)));
            System.out.println(sha + "  providers/keycloak-lesson-authenticator-1.0.0.jar");
        }
        if (count < 300) throw new IllegalStateException("Incomplete server runtime inventory: " + count);
    }
}
