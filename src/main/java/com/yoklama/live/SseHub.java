package com.yoklama.live;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SseHub {

    private static final Logger log = LoggerFactory.getLogger(SseHub.class);
    private final Map<Long, Set<SseEmitter>> emitters = new ConcurrentHashMap<>();

    public SseEmitter subscribe(long sessionId) {
        SseEmitter e = new SseEmitter(Duration.ofMinutes(30).toMillis());
        emitters.compute(sessionId, (k, set) -> {
            Set<SseEmitter> s = set != null ? set : ConcurrentHashMap.newKeySet();
            s.add(e);
            return s;
        });
        Runnable remove = () -> remove(sessionId, e);
        e.onCompletion(remove);
        e.onTimeout(remove);
        e.onError(t -> remove.run());
        try {
            // Flushes the response headers right away so EventSource.onopen fires.
            e.send(SseEmitter.event().comment("connected"));
        } catch (Exception ex) {
            remove(sessionId, e);
        }
        return e;
    }

    public void publish(long sessionId, String event, Object data) {
        var set = emitters.get(sessionId);
        if (set == null) return;
        for (var emitter : Set.copyOf(set)) {
            try {
                emitter.send(SseEmitter.event().name(event).data(data));
            } catch (Exception e) {
                log.debug("Dropping SSE subscriber for session {}: {}", sessionId, e.toString());
                drop(sessionId, emitter);
            }
        }
    }

    public int subscriberCount(long sessionId) {
        var set = emitters.get(sessionId);
        return set == null ? 0 : set.size();
    }

    @Scheduled(fixedRate = 15_000)
    public void heartbeat() {
        emitters.forEach((sessionId, set) -> {
            for (var emitter : Set.copyOf(set)) {
                try {
                    emitter.send(SseEmitter.event().comment("ping"));
                } catch (Exception e) {
                    drop(sessionId, emitter);
                }
            }
        });
    }

    private void drop(long sessionId, SseEmitter emitter) {
        remove(sessionId, emitter);
        try {
            emitter.complete();
        } catch (Exception ignored) {
            // already completed
        }
    }

    private void remove(long sessionId, SseEmitter emitter) {
        emitters.computeIfPresent(sessionId, (k, set) -> {
            set.remove(emitter);
            return set.isEmpty() ? null : set;
        });
    }
}
