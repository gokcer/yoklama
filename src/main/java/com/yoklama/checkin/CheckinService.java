package com.yoklama.checkin;

import com.yoklama.attendance.*;
import com.yoklama.classroom.Classroom;
import com.yoklama.common.ApiException;
import com.yoklama.common.ErrorCode;
import com.yoklama.common.Strings;
import com.yoklama.config.AppProperties;
import com.yoklama.course.RosterEntry;
import com.yoklama.course.RosterEntryRepository;
import com.yoklama.crypto.BleChallenge;
import com.yoklama.decision.*;
import com.yoklama.frames.FrameStorage;
import com.yoklama.live.LiveEvents;
import com.yoklama.session.BleMode;
import com.yoklama.session.ClassSession;
import com.yoklama.session.ClassSessionRepository;
import com.yoklama.session.GeoMode;
import com.yoklama.session.SessionService;
import com.yoklama.session.SessionStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;

@Service
public class CheckinService {

    private static final Logger log = LoggerFactory.getLogger(CheckinService.class);
    private static final char[] NONCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".toCharArray();
    private static final Set<String> FRAME_TIME_SOURCES = Set.of("captureTime", "callback", "raf");
    private static final Pattern CAMERA_HASH = Pattern.compile("^[0-9a-f]{64}$");
    /** SHA-256 of the empty string: what a browser without a camera deviceId would send. */
    private static final String EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    private final ClassSessionRepository sessionRepo;
    private final CheckinAttemptRepository attemptRepo;
    private final ScanRecordRepository scanRepo;
    private final AttendanceRepository attendanceRepo;
    private final RosterEntryRepository rosterRepo;
    private final ScanValidator validator;
    private final DecisionEngine decisionEngine;
    private final SessionService sessionService;
    private final FrameStorage frameStorage;
    private final LiveEvents liveEvents;
    private final AppProperties props;
    private final Clock clock;
    private final TransactionTemplate tx;
    private final Pattern studentNoPattern;
    private final SecureRandom random = new SecureRandom();

    public CheckinService(ClassSessionRepository sessionRepo, CheckinAttemptRepository attemptRepo,
                          ScanRecordRepository scanRepo, AttendanceRepository attendanceRepo,
                          RosterEntryRepository rosterRepo, ScanValidator validator,
                          DecisionEngine decisionEngine, SessionService sessionService,
                          FrameStorage frameStorage, LiveEvents liveEvents, AppProperties props,
                          Clock clock, PlatformTransactionManager txManager) {
        this.sessionRepo = sessionRepo;
        this.attemptRepo = attemptRepo;
        this.scanRepo = scanRepo;
        this.attendanceRepo = attendanceRepo;
        this.rosterRepo = rosterRepo;
        this.validator = validator;
        this.decisionEngine = decisionEngine;
        this.sessionService = sessionService;
        this.frameStorage = frameStorage;
        this.liveEvents = liveEvents;
        this.props = props;
        this.clock = clock;
        this.tx = new TransactionTemplate(txManager);
        this.studentNoPattern = Pattern.compile(props.checkin().studentNoPattern());
    }

    public record StartResult(UUID attemptId, Instant expiresAt, String studentName) {}

    @Transactional
    public StartResult start(String sessionCode, String studentNo, String deviceId,
                             String ip, String userAgent) {
        String no = studentNo.trim();
        if (!studentNoPattern.matcher(no).matches()) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, Map.of("studentNo", "Geçersiz format"));
        }

        String code = sessionCode.trim().toUpperCase(Locale.ROOT);
        Instant now = Instant.now(clock);
        ClassSession session = sessionRepo.findByCodeAndStatus(code, SessionStatus.OPEN)
                .orElseThrow(() -> sessionRepo.findFirstByCodeAndStatusOrderByClosedAtDesc(code, SessionStatus.CLOSED)
                        .isPresent()
                        ? new ApiException(ErrorCode.SESSION_NOT_OPEN)
                        : new ApiException(ErrorCode.SESSION_NOT_FOUND));
        if (!isOpenAt(session, now)) {
            throw new ApiException(ErrorCode.SESSION_NOT_OPEN);
        }

        Optional<RosterEntry> entry = rosterRepo.findByCourseIdAndStudentNo(session.getCourse().getId(), no);
        if (session.isRequireRoster() && entry.isEmpty()) {
            throw new ApiException(ErrorCode.NOT_IN_ROSTER);
        }
        if (attendanceRepo.existsBySession_IdAndStudentNo(session.getId(), no)) {
            throw new ApiException(ErrorCode.ALREADY_CHECKED_IN);
        }
        if (attendanceRepo.existsBySession_IdAndDeviceId(session.getId(), deviceId)) {
            throw new ApiException(ErrorCode.DEVICE_ALREADY_USED);
        }

        attemptRepo.findBySession_IdAndDeviceIdAndState(session.getId(), deviceId, AttemptState.SCANNING)
                .forEach(a -> a.setState(AttemptState.EXPIRED));

        Instant expiresAt = now.plus(Duration.ofSeconds(props.checkin().attemptTtlSeconds()));
        CheckinAttempt attempt = new CheckinAttempt(UUID.randomUUID(), session, no, deviceId,
                Strings.clip(ip, 64), Strings.clip(userAgent, 512), now, expiresAt);
        attemptRepo.save(attempt);

        return new StartResult(attempt.getId(), expiresAt, entry.map(RosterEntry::getFullName).orElse(null));
    }

    @Transactional(noRollbackFor = ApiException.class)
    public void recordSync(UUID attemptId, String deviceId, int offsetMs, int rttMs) {
        CheckinAttempt attempt = getScanningAttempt(attemptId, deviceId);
        attempt.setSync1OffsetMs(offsetMs);
        attempt.setSync1RttMs(Math.max(0, rttMs));
    }

    public record ScanResponse(boolean valid, String reason, int distinctValid, int required, boolean complete) {}

    @Transactional(noRollbackFor = ApiException.class)
    public ScanResponse recordScan(UUID attemptId, String deviceId, String token,
                                   long firstSeenServerMs, String frameTimeSource,
                                   int frameW, int frameH, double[][] corners) {
        long arrivalMs = clock.millis();
        CheckinAttempt attempt = getScanningAttempt(attemptId, deviceId);
        ClassSession session = attempt.getSession();

        if (!FRAME_TIME_SOURCES.contains(frameTimeSource)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, Map.of("frameTimeSource", "Geçersiz değer"));
        }
        if (scanRepo.countByAttemptId(attemptId) >= props.checkin().maxScansPerAttempt()) {
            throw new ApiException(ErrorCode.RATE_LIMITED);
        }

        List<ScanRecord> existing = scanRepo.findByAttemptIdOrderByIdAsc(attemptId);
        Set<Integer> validSeqs = new HashSet<>(ScanValidator.distinctValidSeqs(existing));

        ScanValidator.ValidationResult result = validator.validate(
                token, firstSeenServerMs, arrivalMs, sessionService.sessionKey(session), session, validSeqs);

        ScanRecord record = new ScanRecord(attempt, Strings.clip(token, 64) != null ? Strings.clip(token, 64) : "",
                firstSeenServerMs, arrivalMs, frameTimeSource, Math.max(0, frameW), Math.max(0, frameH));
        record.setValid(result.valid());
        record.setReason(result.reason());
        record.setClockSuspect(result.clockSuspect());
        record.setDuplicate(result.duplicate());
        if (result.token() != null) {
            record.setSeq(result.token().seq());
            record.setTsMs(result.token().ts());
        }
        record.setAreaRatio(ScanGeometry.areaRatio(corners, frameW, frameH));
        record.setCorners(ScanGeometry.format(corners));
        scanRepo.save(record);

        if (result.valid() && !result.duplicate()) validSeqs.add(result.token().seq());
        boolean complete = ScanValidator.isComplete(validSeqs, session.getRequiredScans(), session.getMaxSpanSlots());
        return new ScanResponse(result.valid(), result.reason(), validSeqs.size(),
                session.getRequiredScans(), complete);
    }

    @Transactional(noRollbackFor = ApiException.class)
    public void storeFrame(UUID attemptId, String deviceId, byte[] data, int seq) throws IOException {
        CheckinAttempt attempt = getScanningAttempt(attemptId, deviceId);
        if (!attempt.getSession().isFrameCapture() || attempt.getFramePath() != null) return;

        if (data.length < 3 || data[0] != (byte) 0xFF || data[1] != (byte) 0xD8 || data[2] != (byte) 0xFF
                || data.length > props.frames().maxBytes()) {
            throw new ApiException(ErrorCode.FRAME_INVALID);
        }

        String path = frameStorage.save(attempt.getSessionId(), attempt.getId(), data);
        attempt.setFramePath(path);
        attempt.setFrameSeq(seq);
    }

    public record BleNonceResponse(String nonce, long expiresInMs,
                                   String serviceUuid, String nonceCharUuid,
                                   String responseCharUuid, String beaconName) {}

    @Transactional(noRollbackFor = ApiException.class)
    public BleNonceResponse bleNonce(UUID attemptId, String deviceId) {
        CheckinAttempt attempt = getScanningAttempt(attemptId, deviceId);
        ClassSession session = attempt.getSession();
        Classroom classroom = session.getClassroom();

        if (session.getBleMode() != BleMode.OPTIONAL || classroom == null
                || classroom.getBleKeyHex() == null || classroom.getBleKeyHex().isEmpty()) {
            throw new ApiException(ErrorCode.CONFLICT);
        }

        String nonce = generateNonce(16);
        attempt.setBleNonce(nonce);
        attempt.setBleNonceExpiresMs(clock.millis() + props.ble().nonceTtlMs());

        return new BleNonceResponse(nonce, props.ble().nonceTtlMs(),
                props.ble().serviceUuid(), props.ble().nonceCharUuid(),
                props.ble().responseCharUuid(),
                classroom.getBleBeaconId() != null ? "YKL-" + classroom.getBleBeaconId() : null);
    }

    public record BleVerifyResponse(boolean verified) {}

    @Transactional(noRollbackFor = ApiException.class)
    public BleVerifyResponse bleVerify(UUID attemptId, String deviceId, String response) {
        CheckinAttempt attempt = getScanningAttempt(attemptId, deviceId);
        if (response == null || response.isBlank()) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, Map.of("response", "Boş olamaz"));
        }
        String nonce = attempt.getBleNonce();
        Long expiresMs = attempt.getBleNonceExpiresMs();
        // Single use: whatever the outcome, this nonce cannot be tried again.
        attempt.setBleNonce(null);
        attempt.setBleNonceExpiresMs(null);
        if (nonce == null || expiresMs == null || clock.millis() > expiresMs) {
            throw new ApiException(ErrorCode.BLE_NONCE_EXPIRED);
        }

        Classroom classroom = attempt.getSession().getClassroom();
        if (classroom == null || classroom.getBleKeyHex() == null) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        byte[] bleKey = HexFormat.of().parseHex(classroom.getBleKeyHex());
        boolean ok = BleChallenge.verify(bleKey, nonce, response.trim());
        if (ok) attempt.setBleVerified(true);
        return new BleVerifyResponse(ok);
    }

    public record CompleteRequest(SyncData sync2, GeoData geo, CameraData camera) {}
    public record SyncData(int offsetMs, int rttMs) {}
    public record GeoData(String state, Double lat, Double lng, Double accuracyM) {}
    public record CameraData(String idHash, String label) {}
    public record CompleteResponse(String result, String studentNo, String studentName, String recordedAt) {}

    /** A hard rejection (07 §1): the attempt is marked REJECTED in its own transaction. */
    private static final class Rejection extends RuntimeException {
        final ErrorCode code;
        Rejection(ErrorCode code) {
            super(code.name(), null, false, false);
            this.code = code;
        }
    }

    public CompleteResponse complete(UUID attemptId, String deviceId, CompleteRequest req) {
        try {
            return tx.execute(status -> doComplete(attemptId, deviceId, req != null ? req
                    : new CompleteRequest(null, null, null)));
        } catch (Rejection r) {
            tx.executeWithoutResult(status -> markRejected(attemptId, r.code));
            throw new ApiException(r.code);
        }
    }

    private CompleteResponse doComplete(UUID attemptId, String deviceId, CompleteRequest req) {
        CheckinAttempt attempt = getOwnedAttempt(attemptId, deviceId);
        ClassSession session = attempt.getSession();
        Classroom classroom = session.getClassroom();
        Instant now = Instant.now(clock);

        // H1–H5, in order.
        if (!isOpenAt(session, now)) throw new Rejection(ErrorCode.SESSION_NOT_OPEN);
        if (attempt.getState() != AttemptState.SCANNING || now.isAfter(attempt.getExpiresAt())) {
            throw new Rejection(ErrorCode.ATTEMPT_EXPIRED);
        }
        List<ScanRecord> scans = scanRepo.findByAttemptIdOrderByIdAsc(attemptId);
        if (!ScanValidator.checkCompletionCondition(scans, session.getRequiredScans(), session.getMaxSpanSlots())) {
            throw new Rejection(ErrorCode.NOT_ENOUGH_SCANS);
        }
        if (attendanceRepo.existsBySession_IdAndStudentNo(session.getId(), attempt.getStudentNo())) {
            throw new Rejection(ErrorCode.ALREADY_CHECKED_IN);
        }
        if (attendanceRepo.existsBySession_IdAndDeviceId(session.getId(), attempt.getDeviceId())) {
            throw new Rejection(ErrorCode.DEVICE_ALREADY_USED);
        }

        String cameraIdHash = req.camera() != null ? normalizeCameraHash(req.camera().idHash()) : null;
        String cameraLabel = req.camera() != null ? Strings.clip(req.camera().label(), 200) : null;
        boolean cameraReused = cameraIdHash != null && attendanceRepo.existsBySession_IdAndCameraIdHashAndStudentNoNot(
                session.getId(), cameraIdHash, attempt.getStudentNo());

        boolean geoOn = session.getGeoMode() == GeoMode.FLAG;
        GeoData geo = geoOn && req.geo() != null ? sanitize(req.geo()) : null;

        List<ScanRecord> validScans = scans.stream().filter(s -> s.isValid() && !s.isDuplicate()).toList();
        DecisionInput input = new DecisionInput(
                validScans,
                attempt.getFramePath() != null,
                session.isFrameCapture(),
                attempt.isBleVerified(),
                props.checkin().bleClearsLatency(),
                sessionService.effectiveLatencyThreshold(session),
                sessionService.thresholdSource(session),
                sessionService.effectiveAreaThreshold(session),
                session.getGeoMode().name(),
                geo != null ? geo.lat() : null,
                geo != null ? geo.lng() : null,
                geo != null ? geo.accuracyM() : null,
                geo != null ? geo.state() : null,
                classroom != null ? classroom.getLatitude() : null,
                classroom != null ? classroom.getLongitude() : null,
                classroom != null ? classroom.getRadiusM() : null,
                props.checkin().maxGeoAccuracyM(),
                attempt.getSync1RttMs(), attempt.getSync1OffsetMs(),
                req.sync2() != null ? Math.max(0, req.sync2().rttMs()) : null,
                req.sync2() != null ? req.sync2().offsetMs() : null,
                props.checkin().maxClockRttMs(),
                cameraReused
        );
        Decision decision = decisionEngine.evaluate(input);

        Attendance att = new Attendance(session, attempt.getStudentNo(),
                AttendanceSource.CHECKIN, decision.status(), now);
        att.setAttemptId(attempt.getId());
        att.setDeviceId(attempt.getDeviceId());
        att.setFlags(decision.flags());
        att.setMinLatencyMs(decision.minLatencyMs());
        att.setLatencyThresholdMs(decision.latencyThresholdMs());
        att.setThresholdSource(decision.thresholdSource());
        att.setAreaRatioMax(decision.areaRatioMax());
        att.setAreaThreshold(decision.areaThreshold());
        att.setGeoState(decision.geoState());
        att.setGeoLat(geo != null ? geo.lat() : null);
        att.setGeoLng(geo != null ? geo.lng() : null);
        att.setGeoAccuracyM(decision.geoAccuracyM());
        att.setGeoDistanceM(decision.geoDistanceM());
        att.setClockOffsetMs(decision.clockOffsetMs());
        att.setClockRttMs(decision.clockRttMs());
        att.setCameraIdHash(cameraIdHash);
        att.setCameraLabel(cameraLabel);
        att.setUserAgent(attempt.getUserAgent());
        att.setBleVerified(attempt.isBleVerified());
        att.setFramePath(attempt.getFramePath());

        String studentName = rosterRepo.findByCourseIdAndStudentNo(
                        session.getCourse().getId(), attempt.getStudentNo())
                .map(RosterEntry::getFullName).orElse(null);
        att.setFullName(studentName);

        try {
            attendanceRepo.saveAndFlush(att);
        } catch (DataIntegrityViolationException e) {
            // Lost a race against a concurrent completion.
            String msg = String.valueOf(e.getMostSpecificCause().getMessage()).toLowerCase(Locale.ROOT);
            throw new Rejection(msg.contains("uq_att_device") ? ErrorCode.DEVICE_ALREADY_USED
                    : ErrorCode.ALREADY_CHECKED_IN);
        }

        attempt.setState(AttemptState.COMPLETED);
        attempt.setResultCode(decision.status().name());

        log.info("checkin sessionId={} studentNo={} status={} flags={} minLatency={} threshold={}",
                session.getId(), attempt.getStudentNo(), decision.status(),
                decision.flags(), decision.minLatencyMs(), decision.latencyThresholdMs());

        liveEvents.attendanceChanged(att);
        return new CompleteResponse("RECORDED", attempt.getStudentNo(), studentName, now.toString());
    }

    private void markRejected(UUID attemptId, ErrorCode code) {
        attemptRepo.findById(attemptId).ifPresent(a -> {
            // Only a live attempt becomes REJECTED; a repeated submit of a finished one leaves it alone.
            if (a.getState() != AttemptState.SCANNING) return;
            a.setState(AttemptState.REJECTED);
            a.setResultCode(code.name());
            log.info("checkin rejected sessionId={} studentNo={} code={}", a.getSessionId(), a.getStudentNo(), code);
            liveEvents.attemptRejected(a.getSessionId(), a.getStudentNo(), code.name(), Instant.now(clock));
        });
    }

    private CheckinAttempt getOwnedAttempt(UUID attemptId, String deviceId) {
        CheckinAttempt attempt = attemptRepo.findById(attemptId)
                .orElseThrow(() -> new ApiException(ErrorCode.ATTEMPT_NOT_FOUND));
        if (!attempt.getDeviceId().equals(deviceId)) {
            // Same answer as a missing attempt: do not reveal that the id exists.
            throw new ApiException(ErrorCode.ATTEMPT_NOT_FOUND);
        }
        return attempt;
    }

    /** Owned attempt still in SCANNING; expires it on access when its TTL has passed. */
    private CheckinAttempt getScanningAttempt(UUID attemptId, String deviceId) {
        CheckinAttempt attempt = getOwnedAttempt(attemptId, deviceId);
        if (attempt.getState() != AttemptState.SCANNING) {
            throw new ApiException(ErrorCode.ATTEMPT_EXPIRED);
        }
        if (Instant.now(clock).isAfter(attempt.getExpiresAt())) {
            attempt.setState(AttemptState.EXPIRED);
            throw new ApiException(ErrorCode.ATTEMPT_EXPIRED);
        }
        return attempt;
    }

    private static boolean isOpenAt(ClassSession s, Instant now) {
        return s.getStatus() == SessionStatus.OPEN && s.getClosesAt() != null && now.isBefore(s.getClosesAt());
    }

    private static String normalizeCameraHash(String hash) {
        if (hash == null) return null;
        String h = hash.trim().toLowerCase(Locale.ROOT);
        return CAMERA_HASH.matcher(h).matches() && !EMPTY_SHA256.equals(h) ? h : null;
    }

    private static GeoData sanitize(GeoData g) {
        Double lat = g.lat() != null && Double.isFinite(g.lat()) && Math.abs(g.lat()) <= 90 ? g.lat() : null;
        Double lng = g.lng() != null && Double.isFinite(g.lng()) && Math.abs(g.lng()) <= 180 ? g.lng() : null;
        Double acc = g.accuracyM() != null && Double.isFinite(g.accuracyM()) && g.accuracyM() >= 0 ? g.accuracyM() : null;
        return new GeoData(g.state() != null ? g.state().trim().toUpperCase(Locale.ROOT) : null, lat, lng, acc);
    }

    private String generateNonce(int length) {
        char[] chars = new char[length];
        for (int i = 0; i < length; i++) {
            chars[i] = NONCE_ALPHABET[random.nextInt(NONCE_ALPHABET.length)];
        }
        return new String(chars);
    }
}
