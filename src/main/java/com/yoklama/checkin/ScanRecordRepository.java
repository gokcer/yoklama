package com.yoklama.checkin;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ScanRecordRepository extends JpaRepository<ScanRecord, Long> {
    List<ScanRecord> findByAttemptIdOrderByIdAsc(UUID attemptId);
    long countByAttemptId(UUID attemptId);
}
