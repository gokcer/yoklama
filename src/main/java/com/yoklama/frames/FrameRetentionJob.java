package com.yoklama.frames;

import com.yoklama.attendance.AttendanceRepository;
import com.yoklama.checkin.CheckinAttemptRepository;
import com.yoklama.config.AppProperties;
import com.yoklama.session.ClassSession;
import com.yoklama.session.ClassSessionRepository;
import com.yoklama.session.SessionStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * Removes camera frames of sessions closed more than {@code retention-days} ago — including frames of
 * attempts that never became an attendance (05 §9.6).
 */
@Component
public class FrameRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(FrameRetentionJob.class);
    private final ClassSessionRepository sessionRepo;
    private final AttendanceRepository attendanceRepo;
    private final CheckinAttemptRepository attemptRepo;
    private final FrameStorage frameStorage;
    private final AppProperties props;
    private final Clock clock;

    public FrameRetentionJob(ClassSessionRepository sessionRepo, AttendanceRepository attendanceRepo,
                             CheckinAttemptRepository attemptRepo, FrameStorage frameStorage,
                             AppProperties props, Clock clock) {
        this.sessionRepo = sessionRepo;
        this.attendanceRepo = attendanceRepo;
        this.attemptRepo = attemptRepo;
        this.frameStorage = frameStorage;
        this.props = props;
        this.clock = clock;
    }

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public int cleanupFrames() {
        Instant cutoff = Instant.now(clock).minus(Duration.ofDays(props.frames().retentionDays()));
        var ids = sessionRepo.findByStatusAndClosedAtBefore(SessionStatus.CLOSED, cutoff).stream()
                .map(ClassSession::getId).toList();
        if (ids.isEmpty()) return 0;
        ids.forEach(frameStorage::deleteSessionDir);
        int cleared = attendanceRepo.clearFramePaths(ids) + attemptRepo.clearFramePaths(ids);
        if (cleared > 0) log.info("Removed frames of {} records in {} sessions", cleared, ids.size());
        return cleared;
    }
}
