package com.yoklama.session;

import com.yoklama.checkin.ScanGeometry;
import com.yoklama.checkin.ScanValidator;
import com.yoklama.common.ApiException;
import com.yoklama.common.ErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class CalibrationService {

    static final Set<String> LABELS = Set.of("FRONT", "MIDDLE", "BACK", "OTHER");
    /** The newest scan of a run must be this recent, so old data cannot be replayed (05 §9.3). */
    static final long MAX_RUN_AGE_MS = 30_000;
    static final int MAX_SCANS = 30;

    private final CalibrationRunRepository calibRepo;
    private final SessionService sessionService;
    private final ScanValidator validator;
    private final Clock clock;

    public CalibrationService(CalibrationRunRepository calibRepo, SessionService sessionService,
                              ScanValidator validator, Clock clock) {
        this.calibRepo = calibRepo;
        this.sessionService = sessionService;
        this.validator = validator;
        this.clock = clock;
    }

    public record CalibScan(String token, long firstSeenServerMs, String frameTimeSource,
                            int frameW, int frameH, double[][] corners) {}

    public record CalibRequest(String label, SyncData sync, List<CalibScan> scans) {}
    public record SyncData(int offsetMs, int rttMs) {}

    @Transactional(readOnly = true)
    public List<CalibrationRun> list(long sessionId) {
        sessionService.get(sessionId);
        return calibRepo.findBySessionIdOrderByCreatedAtAsc(sessionId);
    }

    @Transactional
    public CalibrationRun create(long sessionId, CalibRequest req) {
        long arrivalMs = clock.millis();
        ClassSession session = sessionService.get(sessionId);
        if (session.getStatus() != SessionStatus.OPEN) throw new ApiException(ErrorCode.SESSION_NOT_OPEN);

        String label = req.label() != null ? req.label().trim() : "";
        if (!LABELS.contains(label)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, Map.of("label", "FRONT|MIDDLE|BACK|OTHER"));
        }
        if (req.scans() == null || req.scans().isEmpty() || req.scans().size() > MAX_SCANS) {
            throw new ApiException(ErrorCode.NOT_ENOUGH_SCANS);
        }

        byte[] sessionKey = sessionService.sessionKey(session);
        Set<Integer> seqs = new HashSet<>();
        List<Long> latencies = new ArrayList<>();
        List<Long> trustedLatencies = new ArrayList<>();
        double maxArea = 0;
        long newestFirstSeen = Long.MIN_VALUE;

        for (var scan : req.scans()) {
            if (scan == null) continue;
            var result = validator.validateCalibration(scan.token(), scan.firstSeenServerMs(), arrivalMs,
                    sessionKey, session, seqs);
            if (!result.valid() || result.duplicate()) continue;
            seqs.add(result.token().seq());
            long latency = scan.firstSeenServerMs() - result.token().ts();
            latencies.add(latency);
            if (!result.clockSuspect()) trustedLatencies.add(latency);
            newestFirstSeen = Math.max(newestFirstSeen, scan.firstSeenServerMs());
            Double ratio = ScanGeometry.areaRatio(scan.corners(), scan.frameW(), scan.frameH());
            if (ratio != null && ratio > maxArea) maxArea = ratio;
        }

        if (seqs.size() < session.getRequiredScans() || newestFirstSeen < arrivalMs - MAX_RUN_AGE_MS) {
            throw new ApiException(ErrorCode.NOT_ENOUGH_SCANS);
        }

        List<Long> used = trustedLatencies.isEmpty() ? latencies : trustedLatencies;
        int minLatency = (int) used.stream().mapToLong(Long::longValue).min().orElse(0);
        int rtt = req.sync() != null ? Math.max(0, req.sync().rttMs()) : 0;

        CalibrationRun run = new CalibrationRun(session, label, minLatency, maxArea,
                seqs.size(), rtt, Instant.now(clock));
        calibRepo.save(run);
        updateBaseline(session);
        return run;
    }

    @Transactional
    public void delete(long sessionId, long runId) {
        ClassSession session = sessionService.get(sessionId);
        CalibrationRun run = calibRepo.findByIdAndSessionId(runId, sessionId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        calibRepo.delete(run);
        calibRepo.flush();
        updateBaseline(session);
    }

    /** 07 §5: baseline latency is the median of the runs' minimum latencies; area is the max. */
    void updateBaseline(ClassSession session) {
        List<CalibrationRun> runs = calibRepo.findBySessionIdOrderByCreatedAtAsc(session.getId());
        if (runs.isEmpty()) {
            session.setBaselineLatencyMs(null);
            session.setBaselineAreaRatioMax(null);
            return;
        }
        int[] sorted = runs.stream().mapToInt(CalibrationRun::getMinLatencyMs).sorted().toArray();
        int n = sorted.length;
        int median = n % 2 == 1 ? sorted[n / 2] : (int) Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2.0);
        session.setBaselineLatencyMs(median);
        session.setBaselineAreaRatioMax(runs.stream().mapToDouble(CalibrationRun::getMaxAreaRatio).max().orElse(0));
    }
}
