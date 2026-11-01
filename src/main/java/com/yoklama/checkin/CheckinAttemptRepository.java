package com.yoklama.checkin;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface CheckinAttemptRepository extends JpaRepository<CheckinAttempt, UUID> {
    List<CheckinAttempt> findBySession_IdAndDeviceIdAndState(long sessionId, String deviceId, AttemptState state);
    List<CheckinAttempt> findBySession_IdAndStateOrderByCreatedAtDesc(long sessionId, AttemptState state);
    List<CheckinAttempt> findByStateAndExpiresAtBefore(AttemptState state, Instant now);

    @Modifying
    @Query("update CheckinAttempt a set a.framePath = null where a.session.id in :sessionIds and a.framePath is not null")
    int clearFramePaths(@Param("sessionIds") Collection<Long> sessionIds);

    /** Bulk delete; scan_record rows go with them via ON DELETE CASCADE. */
    @Modifying
    @Query("delete from CheckinAttempt a where a.session.id in :sessionIds")
    int deleteBySessionIds(@Param("sessionIds") Collection<Long> sessionIds);
}
