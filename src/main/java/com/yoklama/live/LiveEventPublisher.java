package com.yoklama.live;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class LiveEventPublisher {

    private final SseHub hub;

    public LiveEventPublisher(SseHub hub) {
        this.hub = hub;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onLiveEvent(LiveEvents.LiveEvent event) {
        hub.publish(event.sessionId(), event.name(), event.data());
    }
}
