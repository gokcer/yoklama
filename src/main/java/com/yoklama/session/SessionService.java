package com.yoklama.session;

import com.yoklama.attendance.AttendanceRepository;
import com.yoklama.attendance.AttendanceStatus;
import com.yoklama.attendance.TeacherDecision;
import com.yoklama.classroom.Classroom;
import com.yoklama.classroom.ClassroomRepository;
import com.yoklama.common.ApiException;
import com.yoklama.common.ErrorCode;
import com.yoklama.config.AppProperties;
import com.yoklama.config.MasterSecretConfig.MasterSecret;
import com.yoklama.course.Course;
import com.yoklama.course.CourseRepository;
import com.yoklama.crypto.SessionKeyDerivation;
import com.yoklama.live.LiveEvents;
import com.yoklama.security.CurrentTeacher;
import com.yoklama.teacher.TeacherRole;
import com.yoklama.teacher.TeacherUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SessionService {

    private static final Logger log = LoggerFactory.getLogger(SessionService.class);

    static final int MIN_REFRESH_MS = 500, MAX_REFRESH_MS = 5000;
    static final int MIN_REQUIRED_SCANS = 2, MAX_REQUIRED_SCANS = 6;
    static final int MIN_DURATION = 1, MAX_DURATION = 240;

    private final ClassSessionRepository sessionRepo;
    private final CourseRepository courseRepo;
    private final ClassroomRepository classroomRepo;
    private final AttendanceRepository attendanceRepo;
    private final SessionCodeGenerator codeGen;
    private final CurrentTeacher currentTeacher;
    private final LiveEvents liveEvents;
    private final AppProperties props;
    private final MasterSecret masterSecret;
    private final Clock clock;
    private final ConcurrentHashMap<Long, byte[]> keyCache = new ConcurrentHashMap<>();

    public SessionService(ClassSessionRepository sessionRepo, CourseRepository courseRepo,
                          ClassroomRepository classroomRepo, AttendanceRepository attendanceRepo,
                          SessionCodeGenerator codeGen, CurrentTeacher currentTeacher,
                          LiveEvents liveEvents, AppProperties props,
                          MasterSecret masterSecret, Clock clock) {
        this.sessionRepo = sessionRepo;
        this.courseRepo = courseRepo;
        this.classroomRepo = classroomRepo;
        this.attendanceRepo = attendanceRepo;
        this.codeGen = codeGen;
        this.currentTeacher = currentTeacher;
        this.liveEvents = liveEvents;
        this.props = props;
        this.masterSecret = masterSecret;
        this.clock = clock;
    }

    public record CreateCommand(long courseId, Long classroomId, String title,
                                Integer durationMinutes, Integer refreshMs, Integer requiredScans,
                                Boolean requireRoster, String geoMode, String bleMode,
                                Boolean frameCapture) {}

    @Transactional(readOnly = true)
    public List<ClassSession> listAll(Long courseId, SessionStatus status) {
        TeacherUser teacher = currentTeacher.get();
        List<ClassSession> all = courseId != null ? sessionRepo.findByCourseId(courseId)
                : status != null ? sessionRepo.findByStatus(status)
                : sessionRepo.findAll();
        return all.stream()
                .filter(s -> status == null || s.getStatus() == status)
                .filter(s -> teacher.getRole() == TeacherRole.ADMIN
                        || s.getCourse().getOwnerId().equals(teacher.getId()))
                .sorted(Comparator.comparing(ClassSession::getCreatedAt).reversed())
                .toList();
    }

    @Transactional(readOnly = true)
    public ClassSession get(long id) {
        ClassSession s = sessionRepo.findById(id).orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        currentTeacher.requireOwner(s.getCourse().getOwnerId());
        return s;
    }

    @Transactional
    public ClassSession create(CreateCommand cmd) {
        Course course = courseRepo.findById(cmd.courseId())
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        currentTeacher.requireOwner(course.getOwnerId());

        var defaults = props.checkin().defaults();
        int duration = cmd.durationMinutes() != null ? cmd.durationMinutes() : defaults.durationMinutes();
        int refresh = cmd.refreshMs() != null ? cmd.refreshMs() : defaults.refreshMs();
        int required = cmd.requiredScans() != null ? cmd.requiredScans() : defaults.requiredScans();
        GeoMode geoMode = parseEnum(GeoMode.class, cmd.geoMode() != null ? cmd.geoMode() : defaults.geoMode(), "geoMode");
        BleMode bleMode = parseEnum(BleMode.class, cmd.bleMode() != null ? cmd.bleMode() : defaults.bleMode(), "bleMode");

        if (cmd.title() == null || cmd.title().isBlank() || cmd.title().length() > 200) {
            throw invalid("title", "1-200 karakter olmalı");
        }
        if (duration < MIN_DURATION || duration > MAX_DURATION) {
            throw invalid("durationMinutes", MIN_DURATION + "-" + MAX_DURATION + " arasında olmalı");
        }
        if (refresh < MIN_REFRESH_MS || refresh > MAX_REFRESH_MS) {
            throw invalid("refreshMs", MIN_REFRESH_MS + "-" + MAX_REFRESH_MS + " arasında olmalı");
        }
        if (required < MIN_REQUIRED_SCANS || required > MAX_REQUIRED_SCANS
                || required > defaults.maxSpanSlots()) {
            throw invalid("requiredScans", MIN_REQUIRED_SCANS + "-" + MAX_REQUIRED_SCANS + " arasında olmalı");
        }

        Classroom classroom = null;
        if (cmd.classroomId() != null) {
            classroom = classroomRepo.findById(cmd.classroomId())
                    .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
            currentTeacher.requireOwner(classroom.getOwnerId());
        }
        if (geoMode == GeoMode.FLAG && (classroom == null || classroom.getLatitude() == null
                || classroom.getLongitude() == null || classroom.getRadiusM() == null)) {
            throw invalid("geoMode", "Konum kontrolü için dersliğin koordinatları ve yarıçapı tanımlı olmalı");
        }
        if (bleMode == BleMode.OPTIONAL && (classroom == null || classroom.getBleKeyHex() == null)) {
            throw invalid("bleMode", "BLE için dersliğin BLE anahtarı üretilmiş olmalı");
        }

        ClassSession s = new ClassSession(course, cmd.title().trim(), codeGen.generate(), Instant.now(clock));
        s.setClassroom(classroom);
        s.setDurationMinutes(duration);
        s.setRefreshMs(refresh);
        s.setRequiredScans(required);
        s.setMaxSpanSlots(defaults.maxSpanSlots());
        s.setMaxTokenAgeMs(defaults.maxTokenAgeMs());
        s.setLatencyMarginMs(defaults.latencyMarginMs());
        s.setDefaultLatencyThresholdMs(defaults.defaultLatencyThresholdMs());
        s.setScreenAreaRatioThreshold(defaults.screenAreaRatioThreshold());
        s.setRequireRoster(cmd.requireRoster() != null ? cmd.requireRoster() : defaults.requireRoster());
        s.setGeoMode(geoMode);
        s.setBleMode(bleMode);
        s.setFrameCapture(cmd.frameCapture() != null ? cmd.frameCapture() : defaults.frameCapture());
        return sessionRepo.save(s);
    }

    @Transactional
    public ClassSession open(long id) {
        ClassSession s = get(id);
        if (s.getStatus() != SessionStatus.DRAFT) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        long now = clock.millis();
        long epochStart = Math.ceilDiv(now, 1000L) * 1000L;
        s.setEpochStartMs(epochStart);
        s.setOpenedAt(Instant.ofEpochMilli(now));
        s.setClosesAt(Instant.ofEpochMilli(now).plus(Duration.ofMinutes(s.getDurationMinutes())));
        s.setStatus(SessionStatus.OPEN);
        sessionRepo.save(s);
        liveEvents.sessionChanged(s);
        return s;
    }

    @Transactional
    public ClassSession extend(long id, int minutes) {
        ClassSession s = get(id);
        if (minutes < 1 || minutes > MAX_DURATION) {
            throw invalid("minutes", "1-" + MAX_DURATION + " arasında olmalı");
        }
        if (s.getStatus() != SessionStatus.OPEN) throw new ApiException(ErrorCode.CONFLICT);
        Instant base = s.getClosesAt().isAfter(Instant.now(clock)) ? s.getClosesAt() : Instant.now(clock);
        s.setClosesAt(base.plus(Duration.ofMinutes(minutes)));
        sessionRepo.save(s);
        liveEvents.sessionChanged(s);
        return s;
    }

    @Transactional
    public ClassSession close(long id) {
        ClassSession s = get(id);
        if (s.getStatus() != SessionStatus.OPEN) throw new ApiException(ErrorCode.CONFLICT);
        markClosed(s);
        return s;
    }

    /** Scheduler entry point: no teacher context. */
    @Transactional
    public int closeExpired() {
        Instant now = Instant.now(clock);
        var expired = sessionRepo.findByStatusAndClosesAtLessThanEqual(SessionStatus.OPEN, now);
        for (var s : expired) {
            markClosed(s);
            log.info("Auto-closed session id={} code={}", s.getId(), s.getCode());
        }
        return expired.size();
    }

    private void markClosed(ClassSession s) {
        Instant now = Instant.now(clock);
        s.setStatus(SessionStatus.CLOSED);
        s.setClosedAt(now);
        // Closing early also ends the token window.
        if (s.getClosesAt() == null || s.getClosesAt().isAfter(now)) s.setClosesAt(now);
        sessionRepo.save(s);
        liveEvents.sessionChanged(s);
    }

    @Transactional
    public void delete(long id) {
        ClassSession s = get(id);
        if (s.getStatus() != SessionStatus.DRAFT) throw new ApiException(ErrorCode.CONFLICT);
        sessionRepo.delete(s);
    }

    public byte[] sessionKey(ClassSession session) {
        return keyCache.computeIfAbsent(session.getId(),
                k -> SessionKeyDerivation.derive(masterSecret.value(), session.getId(), session.getCode()));
    }

    public record DisplayConfig(long sessionId, String code, String sessionKeyB64, long epochStartMs,
                                int refreshMs, String closesAt, String joinUrl,
                                String courseCode, String title) {}

    public DisplayConfig displayConfig(long id) {
        ClassSession s = get(id);
        if (s.getStatus() != SessionStatus.OPEN) throw new ApiException(ErrorCode.SESSION_NOT_OPEN);
        byte[] key = sessionKey(s);
        return new DisplayConfig(s.getId(), s.getCode(),
                Base64.getEncoder().encodeToString(key),
                s.getEpochStartMs(), s.getRefreshMs(),
                s.getClosesAt().toString(),
                joinUrl(s),
                s.getCourse().getCode(), s.getTitle());
    }

    public String joinUrl(ClassSession s) {
        String base = props.publicBaseUrl();
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base + "/c/" + s.getCode();
    }

    public int effectiveLatencyThreshold(ClassSession s) {
        if (s.getBaselineLatencyMs() != null) {
            return s.getBaselineLatencyMs() + s.getLatencyMarginMs();
        }
        return s.getDefaultLatencyThresholdMs();
    }

    public String thresholdSource(ClassSession s) {
        return s.getBaselineLatencyMs() != null ? "CALIBRATED" : "DEFAULT";
    }

    public double effectiveAreaThreshold(ClassSession s) {
        if (s.getBaselineAreaRatioMax() != null) {
            return Math.max(s.getBaselineAreaRatioMax() * 2.0, 0.10);
        }
        return s.getScreenAreaRatioThreshold();
    }

    public long attendanceCount(long sessionId) {
        return attendanceRepo.countBySession_Id(sessionId);
    }

    public long flaggedPendingCount(long sessionId) {
        return attendanceRepo.countBySession_IdAndStatusAndTeacherDecision(
                sessionId, AttendanceStatus.FLAGGED, TeacherDecision.NONE);
    }

    static <E extends Enum<E>> E parseEnum(Class<E> type, String value, String field) {
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (RuntimeException e) {
            throw invalid(field, "Geçersiz değer");
        }
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(ErrorCode.VALIDATION_ERROR, Map.of(field, message));
    }
}
