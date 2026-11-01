package com.yoklama.live;

import com.yoklama.attendance.Attendance;
import com.yoklama.attendance.AttendanceDto;
import com.yoklama.attendance.AttendanceRepository;
import com.yoklama.attendance.AttendanceStatus;
import com.yoklama.attendance.TeacherDecision;
import com.yoklama.session.ClassSession;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Domain-level live events. Payloads are built inside the caller's transaction and delivered to SSE
 * subscribers by {@link LiveEventPublisher} only after that transaction commits.
 */
@Component
public class LiveEvents {

    public record LiveEvent(long sessionId, String name, Object data) {}

    private final ApplicationEventPublisher publisher;
    private final AttendanceRepository attendanceRepo;

    public LiveEvents(ApplicationEventPublisher publisher, AttendanceRepository attendanceRepo) {
        this.publisher = publisher;
        this.attendanceRepo = attendanceRepo;
    }

    public void attendanceChanged(Attendance a) {
        publisher.publishEvent(new LiveEvent(a.getSessionId(), "attendance", AttendanceDto.from(a)));
        sessionChanged(a.getSession());
    }

    public void attendanceDeleted(ClassSession session, long attendanceId) {
        publisher.publishEvent(new LiveEvent(session.getId(), "attendance-deleted", Map.of("id", attendanceId)));
        sessionChanged(session);
    }

    public void sessionChanged(ClassSession s) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", s.getStatus().name());
        data.put("closesAt", s.getClosesAt() != null ? s.getClosesAt().toString() : null);
        data.put("attendanceCount", attendanceRepo.countBySession_Id(s.getId()));
        data.put("flaggedPendingCount", attendanceRepo.countBySession_IdAndStatusAndTeacherDecision(
                s.getId(), AttendanceStatus.FLAGGED, TeacherDecision.NONE));
        publisher.publishEvent(new LiveEvent(s.getId(), "session", data));
    }

    public void attemptRejected(long sessionId, String studentNo, String code, Instant at) {
        publisher.publishEvent(new LiveEvent(sessionId, "attempt-rejected",
                Map.of("studentNo", studentNo, "code", code, "at", at.toString())));
    }
}
