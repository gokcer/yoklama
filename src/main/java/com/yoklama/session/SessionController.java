package com.yoklama.session;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    private final SessionService service;
    private final CalibrationService calibService;

    public SessionController(SessionService service, CalibrationService calibService) {
        this.service = service;
        this.calibService = calibService;
    }

    public record SessionSummaryDto(long id, long courseId, String courseCode, String courseName, String title,
                                    String code, String status, int durationMinutes,
                                    String closesAt, String createdAt,
                                    long attendanceCount, long flaggedPendingCount) {}

    public record SessionDetailDto(long id, String courseCode, String courseName, long courseId,
                                   Long classroomId, String classroomName,
                                   String title, String code, String status,
                                   int durationMinutes, int refreshMs, int requiredScans,
                                   int maxSpanSlots, int maxTokenAgeMs, int latencyMarginMs,
                                   int defaultLatencyThresholdMs, double screenAreaRatioThreshold,
                                   boolean requireRoster, String geoMode, String bleMode,
                                   boolean frameCapture,
                                   Long epochStartMs, String openedAt, String closesAt, String closedAt,
                                   Integer baselineLatencyMs, Double baselineAreaRatioMax,
                                   int effectiveLatencyThresholdMs, double effectiveAreaThreshold,
                                   String thresholdSource, String joinUrl,
                                   long attendanceCount, long flaggedPendingCount,
                                   String createdAt) {}

    public record CreateSessionRequest(@NotNull Long courseId, Long classroomId,
                                       @NotBlank String title, Integer durationMinutes,
                                       Integer refreshMs, Integer requiredScans,
                                       Boolean requireRoster, String geoMode, String bleMode,
                                       Boolean frameCapture) {}

    public record ExtendRequest(@NotNull Integer minutes) {}
    public record ReopenRequest(Integer minutes) {}

    public record CalibRunDto(long id, String label, int minLatencyMs, double maxAreaRatio,
                              int validScanCount, String createdAt) {
        static CalibRunDto from(CalibrationRun r) {
            return new CalibRunDto(r.getId(), r.getLabel(), r.getMinLatencyMs(), r.getMaxAreaRatio(),
                    r.getValidScanCount(), r.getCreatedAt().toString());
        }
    }

    @GetMapping
    public List<SessionSummaryDto> list(@RequestParam(required = false) Long courseId,
                                        @RequestParam(required = false) String status) {
        SessionStatus statusEnum = status != null && !status.isBlank()
                ? SessionService.parseEnum(SessionStatus.class, status, "status") : null;
        return service.listAll(courseId, statusEnum).stream()
                .map(this::toSummary)
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SessionDetailDto create(@Valid @RequestBody CreateSessionRequest req) {
        ClassSession s = service.create(new SessionService.CreateCommand(req.courseId(), req.classroomId(),
                req.title(), req.durationMinutes(), req.refreshMs(), req.requiredScans(),
                req.requireRoster(), req.geoMode(), req.bleMode(), req.frameCapture()));
        return toDetail(s);
    }

    @GetMapping("/{id}")
    public SessionDetailDto get(@PathVariable long id) {
        return toDetail(service.get(id));
    }

    @PostMapping("/{id}/open")
    public SessionDetailDto open(@PathVariable long id) {
        return toDetail(service.open(id));
    }

    @PostMapping("/{id}/extend")
    public SessionDetailDto extend(@PathVariable long id, @Valid @RequestBody ExtendRequest req) {
        return toDetail(service.extend(id, req.minutes()));
    }

    @PostMapping("/{id}/close")
    public SessionDetailDto close(@PathVariable long id) {
        return toDetail(service.close(id));
    }

    @PostMapping("/{id}/reopen")
    public SessionDetailDto reopen(@PathVariable long id, @RequestBody(required = false) ReopenRequest req) {
        int minutes = req != null && req.minutes() != null ? req.minutes() : 15;
        return toDetail(service.reopen(id, minutes));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        service.delete(id);
    }

    @GetMapping("/{id}/display-config")
    public ResponseEntity<SessionService.DisplayConfig> displayConfig(@PathVariable long id) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.displayConfig(id));
    }

    @GetMapping("/{id}/calibration-runs")
    public List<CalibRunDto> listCalibRuns(@PathVariable long id) {
        return calibService.list(id).stream().map(CalibRunDto::from).toList();
    }

    @PostMapping("/{id}/calibration-runs")
    @ResponseStatus(HttpStatus.CREATED)
    public CalibRunDto createCalibRun(@PathVariable long id, @RequestBody CalibrationService.CalibRequest req) {
        return CalibRunDto.from(calibService.create(id, req));
    }

    @DeleteMapping("/{id}/calibration-runs/{runId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCalibRun(@PathVariable long id, @PathVariable long runId) {
        calibService.delete(id, runId);
    }

    private SessionSummaryDto toSummary(ClassSession s) {
        return new SessionSummaryDto(s.getId(), s.getCourse().getId(),
                s.getCourse().getCode(), s.getCourse().getName(),
                s.getTitle(), s.getCode(), s.getStatus().name(),
                s.getDurationMinutes(),
                s.getClosesAt() != null ? s.getClosesAt().toString() : null,
                s.getCreatedAt().toString(),
                service.attendanceCount(s.getId()),
                service.flaggedPendingCount(s.getId()));
    }

    private SessionDetailDto toDetail(ClassSession s) {
        return new SessionDetailDto(s.getId(),
                s.getCourse().getCode(), s.getCourse().getName(), s.getCourse().getId(),
                s.getClassroom() != null ? s.getClassroom().getId() : null,
                s.getClassroom() != null ? s.getClassroom().getName() : null,
                s.getTitle(), s.getCode(), s.getStatus().name(),
                s.getDurationMinutes(), s.getRefreshMs(), s.getRequiredScans(),
                s.getMaxSpanSlots(), s.getMaxTokenAgeMs(), s.getLatencyMarginMs(),
                s.getDefaultLatencyThresholdMs(), s.getScreenAreaRatioThreshold(),
                s.isRequireRoster(), s.getGeoMode().name(), s.getBleMode().name(),
                s.isFrameCapture(),
                s.getEpochStartMs(),
                s.getOpenedAt() != null ? s.getOpenedAt().toString() : null,
                s.getClosesAt() != null ? s.getClosesAt().toString() : null,
                s.getClosedAt() != null ? s.getClosedAt().toString() : null,
                s.getBaselineLatencyMs(), s.getBaselineAreaRatioMax(),
                service.effectiveLatencyThreshold(s),
                service.effectiveAreaThreshold(s),
                service.thresholdSource(s),
                s.getStatus() != SessionStatus.DRAFT ? service.joinUrl(s) : null,
                service.attendanceCount(s.getId()),
                service.flaggedPendingCount(s.getId()),
                s.getCreatedAt().toString());
    }
}
