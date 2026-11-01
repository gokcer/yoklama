package com.yoklama.session;

import org.springframework.data.jpa.repository.JpaRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ClassSessionRepository extends JpaRepository<ClassSession, Long> {
    Optional<ClassSession> findByCodeAndStatus(String code, SessionStatus status);
    /** Codes are only unique among DRAFT/OPEN sessions, so several CLOSED ones may share a code. */
    Optional<ClassSession> findFirstByCodeAndStatusOrderByClosedAtDesc(String code, SessionStatus status);
    List<ClassSession> findByCourseId(long courseId);
    List<ClassSession> findByStatus(SessionStatus status);
    List<ClassSession> findByStatusAndClosesAtLessThanEqual(SessionStatus status, Instant now);
    List<ClassSession> findByStatusAndClosedAtBefore(SessionStatus status, Instant cutoff);
    boolean existsByCodeAndStatusIn(String code, List<SessionStatus> statuses);
    boolean existsByCourseId(long courseId);
    boolean existsByClassroomId(long classroomId);
}
