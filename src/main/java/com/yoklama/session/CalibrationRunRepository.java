package com.yoklama.session;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface CalibrationRunRepository extends JpaRepository<CalibrationRun, Long> {
    List<CalibrationRun> findBySessionIdOrderByCreatedAtAsc(long sessionId);
    Optional<CalibrationRun> findByIdAndSessionId(long id, long sessionId);
}
