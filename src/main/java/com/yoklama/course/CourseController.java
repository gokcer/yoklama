package com.yoklama.course;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/courses")
public class CourseController {

    private final CourseService service;
    private final RosterImportService importService;

    public CourseController(CourseService service, RosterImportService importService) {
        this.service = service;
        this.importService = importService;
    }

    public record CourseDto(long id, String code, String name, long rosterCount, String createdAt) {
        static CourseDto from(Course c, long rosterCount) {
            return new CourseDto(c.getId(), c.getCode(), c.getName(), rosterCount,
                    c.getCreatedAt().toString());
        }
    }

    public record CourseRequest(@NotBlank @Size(max = 32) String code, @NotBlank @Size(max = 200) String name) {}
    public record RosterEntryDto(String studentNo, String fullName) {}
    public record RosterEntryRequest(@NotBlank @Size(max = 32) String studentNo,
                                     @NotBlank @Size(max = 200) String fullName) {}

    @GetMapping
    public List<CourseDto> list() {
        return service.list().stream()
                .map(c -> CourseDto.from(c, service.rosterCount(c.getId())))
                .toList();
    }

    @GetMapping("/{id}")
    public CourseDto get(@PathVariable long id) {
        return CourseDto.from(service.get(id), service.rosterCount(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CourseDto create(@Valid @RequestBody CourseRequest req) {
        return CourseDto.from(service.create(req.code(), req.name()), 0);
    }

    @PutMapping("/{id}")
    public CourseDto update(@PathVariable long id, @Valid @RequestBody CourseRequest req) {
        Course c = service.update(id, req.code(), req.name());
        return CourseDto.from(c, service.rosterCount(id));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        service.delete(id);
    }

    @GetMapping("/{id}/roster")
    public List<RosterEntryDto> roster(@PathVariable long id) {
        return service.roster(id).stream()
                .map(r -> new RosterEntryDto(r.getStudentNo(), r.getFullName()))
                .toList();
    }

    @PostMapping("/{id}/roster/import")
    public RosterImportService.ImportResult importRoster(
            @PathVariable long id,
            @RequestParam(defaultValue = "REPLACE") String mode,
            @RequestParam("file") MultipartFile file) throws IOException {
        Course course = service.get(id);
        return importService.importCsv(course, file.getInputStream(), mode);
    }

    @PostMapping("/{id}/roster")
    @ResponseStatus(HttpStatus.CREATED)
    public RosterEntryDto addRoster(@PathVariable long id, @Valid @RequestBody RosterEntryRequest req) {
        RosterEntry entry = service.addRosterEntry(id, req.studentNo(), req.fullName());
        return new RosterEntryDto(entry.getStudentNo(), entry.getFullName());
    }

    @DeleteMapping("/{id}/roster/{studentNo}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeRoster(@PathVariable long id, @PathVariable String studentNo) {
        service.removeRosterEntry(id, studentNo);
    }
}
