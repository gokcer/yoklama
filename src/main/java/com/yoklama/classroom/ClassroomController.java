package com.yoklama.classroom;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/classrooms")
public class ClassroomController {

    private final ClassroomService service;

    public ClassroomController(ClassroomService service) {
        this.service = service;
    }

    public record ClassroomDto(long id, String name, Double latitude, Double longitude,
                               Integer radiusM, String bleBeaconId, boolean hasBleKey,
                               String createdAt) {
        static ClassroomDto from(Classroom c) {
            return new ClassroomDto(c.getId(), c.getName(), c.getLatitude(), c.getLongitude(),
                    c.getRadiusM(), c.getBleBeaconId(),
                    c.getBleKeyHex() != null && !c.getBleKeyHex().isEmpty(),
                    c.getCreatedAt().toString());
        }
    }

    public record ClassroomRequest(@NotBlank @Size(max = 120) String name,
                                   @DecimalMin("-90") @DecimalMax("90") Double latitude,
                                   @DecimalMin("-180") @DecimalMax("180") Double longitude,
                                   @Min(1) @Max(100_000) Integer radiusM,
                                   // Beacon name "YKL-<id>" must fit the 31-byte advertising packet.
                                   @Size(max = 16) @Pattern(regexp = "^[A-Za-z0-9_-]*$") String bleBeaconId) {
        ClassroomService.ClassroomData toData() {
            return new ClassroomService.ClassroomData(name, latitude, longitude, radiusM, bleBeaconId);
        }
    }

    public record BleKeyDto(String beaconId, String keyHex) {}

    @GetMapping
    public List<ClassroomDto> list() {
        return service.list().stream().map(ClassroomDto::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClassroomDto create(@Valid @RequestBody ClassroomRequest req) {
        return ClassroomDto.from(service.create(req.toData()));
    }

    @PutMapping("/{id}")
    public ClassroomDto update(@PathVariable long id, @Valid @RequestBody ClassroomRequest req) {
        return ClassroomDto.from(service.update(id, req.toData()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        service.delete(id);
    }

    @PostMapping("/{id}/ble-key")
    public ResponseEntity<BleKeyDto> generateBleKey(@PathVariable long id) {
        Classroom c = service.generateBleKey(id);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new BleKeyDto(c.getBleBeaconId(), c.getBleKeyHex()));
    }
}
