package com.yoklama.live;

import com.yoklama.session.SessionService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/sessions/{id}/events")
public class SseController {

    private final SseHub hub;
    private final SessionService sessionService;

    public SseController(SseHub hub, SessionService sessionService) {
        this.hub = hub;
        this.sessionService = sessionService;
    }

    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> events(@PathVariable long id) {
        sessionService.get(id);
        return ResponseEntity.ok()
                .header("X-Accel-Buffering", "no")
                .header("Cache-Control", "no-cache")
                .body(hub.subscribe(id));
    }
}
