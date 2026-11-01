package com.yoklama.checkin;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

@Component
public class AttemptExpiryJob {

    private final CheckinAttemptRepository repo;
    private final Clock clock;

    public AttemptExpiryJob(CheckinAttemptRepository repo, Clock clock) {
        this.repo = repo;
        this.clock = clock;
    }

    @Scheduled(fixedDelay = 30_000)
    @Transactional
    public void expireAttempts() {
        var expired = repo.findByStateAndExpiresAtBefore(AttemptState.SCANNING, Instant.now(clock));
        for (var attempt : expired) {
            attempt.setState(AttemptState.EXPIRED);
            repo.save(attempt);
        }
    }
}
