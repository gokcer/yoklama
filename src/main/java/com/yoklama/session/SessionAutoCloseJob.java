package com.yoklama.session;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class SessionAutoCloseJob {

    private final SessionService sessionService;

    public SessionAutoCloseJob(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @Scheduled(fixedDelay = 10_000)
    public void closeExpiredSessions() {
        sessionService.closeExpired();
    }
}
