import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.jar.JarFile;

/** Build fails if the excluded Docker/HTTP5 classes enter the server runtime. */
class VerifyRuntime {
    public static void main(String[] args) throws Exception {
        int count = 0;
        Path root = Path.of(args[0]);
        Set<String> buildOnlyHashes = new HashSet<>();
        for (String line : Files.readAllLines(Path.of(args[1]))) {
            String hash = line.trim();
            if (hash.isEmpty() || hash.startsWith("#")) continue;
            if (!hash.matches("[a-f0-9]{64}")) throw new IllegalStateException("Malformed build-only hash");
            buildOnlyHashes.add(hash);
        }
        if (buildOnlyHashes.isEmpty()) throw new IllegalStateException("Missing build-only runtime boundary");
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
                if (buildOnlyHashes.contains(sha)) throw new IllegalStateException("Build-only artifact entered server runtime: " + path);
                System.out.println(sha + "  lib/" + root.relativize(path));
                count++;
            }
        }
        if (args.length > 2) {
            Path provider = Path.of(args[2]);
            try (var jar = new JarFile(provider.toFile())) {
                if (jar.stream().anyMatch(e -> e.getName().startsWith("com/github/dockerjava/") ||
                        e.getName().startsWith("org/apache/hc/client5/") || e.getName().startsWith("org/apache/hc/core5/"))) {
                    throw new IllegalStateException("Outside-runtime artifact entered provider: " + provider);
                }
            }
            String sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(provider)));
            if (buildOnlyHashes.contains(sha)) throw new IllegalStateException("Build-only artifact entered provider: " + provider);
            System.out.println(sha + "  providers/keycloak-lesson-authenticator-1.0.0.jar");
        }
        if (count < 300) throw new IllegalStateException("Incomplete server runtime inventory: " + count);
    }
}
