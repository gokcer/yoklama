package com.yoklama.frames;

import com.yoklama.config.AppProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

@Component
public class FrameStorage {

    private final Path root;

    public FrameStorage(AppProperties props) {
        this.root = Path.of(props.frames().dir()).toAbsolutePath().normalize();
    }

    public String save(long sessionId, UUID attemptId, byte[] data) throws IOException {
        String rel = sessionId + "/" + attemptId + ".jpg";
        Path target = root.resolve(rel).normalize();
        if (!target.startsWith(root)) throw new IOException("Path traversal detected");
        Files.createDirectories(target.getParent());
        Files.write(target, data);
        return rel;
    }

    public byte[] load(String relPath) throws IOException {
        Path target = root.resolve(relPath).normalize();
        if (!target.startsWith(root)) throw new IOException("Path traversal detected");
        return Files.readAllBytes(target);
    }

    public void delete(String relPath) {
        if (relPath == null) return;
        try {
            Path target = root.resolve(relPath).normalize();
            if (target.startsWith(root)) Files.deleteIfExists(target);
        } catch (IOException ignored) {}
    }

    public void deleteSessionDir(long sessionId) {
        try {
            Path dir = root.resolve(String.valueOf(sessionId)).normalize();
            if (!dir.startsWith(root)) return;
            if (Files.exists(dir)) {
                try (var walk = Files.walk(dir)) {
                    walk.sorted(java.util.Comparator.reverseOrder()).forEach(p -> {
                        try { Files.deleteIfExists(p); } catch (IOException ignored) {}
                    });
                }
            }
        } catch (IOException ignored) {}
    }
}
