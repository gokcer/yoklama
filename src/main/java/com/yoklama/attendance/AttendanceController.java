package com.yoklama.attendance;

import com.yoklama.checkin.AttemptState;
import com.yoklama.common.ApiException;
import com.yoklama.common.ErrorCode;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/sessions/{sessionId}")
public class AttendanceController {

    private final AttendanceService service;

    public AttendanceController(AttendanceService service) {
        this.service = service;
    }

    public record DecideRequest(String decision, String note) {}
    public record ManualRequest(String studentNo, String note) {}
    public record BulkRequest(List<String> studentNumbers, String note) {}
    public record BulkResultDto(int added, int skipped, List<String> errors) {}
    public record AttemptDto(String studentNo, String resultCode, String createdAt) {}

    @GetMapping("/attendances")
    public List<AttendanceDto> list(@PathVariable long sessionId) {
        return service.list(sessionId).stream().map(AttendanceDto::from).toList();
    }

    @PatchMapping("/attendances/{attId}")
    public AttendanceDto decide(@PathVariable long sessionId, @PathVariable long attId,
                                @RequestBody DecideRequest req) {
        return AttendanceDto.from(service.decide(sessionId, attId,
                parse(TeacherDecision.class, req.decision(), "decision"), req.note()));
    }

    @PostMapping("/attendances/manual")
    @ResponseStatus(HttpStatus.CREATED)
    public AttendanceDto manual(@PathVariable long sessionId, @RequestBody ManualRequest req) {
        return AttendanceDto.from(service.manualAdd(sessionId, req.studentNo(), req.note()));
    }

    @PostMapping("/attendances/bulk")
    public BulkResultDto bulkAdd(@PathVariable long sessionId, @RequestBody BulkRequest req) {
        if (req.studentNumbers() == null || req.studentNumbers().isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, Map.of("studentNumbers", "Liste boş olamaz"));
        }
        var result = service.bulkAdd(sessionId, req.studentNumbers(), req.note());
        return new BulkResultDto(result.added(), result.skipped(), result.errors());
    }

    @DeleteMapping("/attendances/{attId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long sessionId, @PathVariable long attId) {
        service.delete(sessionId, attId);
    }

    @GetMapping("/attendances/{attId}/frame")
    public ResponseEntity<byte[]> frame(@PathVariable long sessionId, @PathVariable long attId) {
        byte[] data = service.loadFrame(sessionId, attId);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                .contentType(MediaType.IMAGE_JPEG)
                .body(data);
    }

    @GetMapping("/attempts")
    public List<AttemptDto> attempts(@PathVariable long sessionId,
                                     @RequestParam(defaultValue = "REJECTED") String state) {
        return service.attempts(sessionId, parse(AttemptState.class, state, "state")).stream()
                .map(a -> new AttemptDto(a.getStudentNo(), a.getResultCode(), a.getCreatedAt().toString()))
                .toList();
    }

    @PostMapping("/reevaluate")
    public Map<String, Integer> reevaluate(@PathVariable long sessionId) {
        return Map.of("updated", service.reevaluate(sessionId));
    }

    private static <E extends Enum<E>> E parse(Class<E> type, String value, String field) {
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (RuntimeException e) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, Map.of(field, "Geçersiz değer"));
        }
    }
}
