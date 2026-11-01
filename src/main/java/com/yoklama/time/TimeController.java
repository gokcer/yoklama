package com.yoklama.time;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;

@RestController
public class TimeController {

    private final Clock clock;

    public TimeController(Clock clock) {
        this.clock = clock;
    }

    public record TimeResponse(long serverTime) {}

    @GetMapping("/api/public/time")
    public ResponseEntity<TimeResponse> time() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new TimeResponse(clock.millis()));
    }
}
