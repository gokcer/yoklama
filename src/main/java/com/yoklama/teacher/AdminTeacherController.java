package com.yoklama.teacher;

import com.yoklama.common.ApiException;
import com.yoklama.common.ErrorCode;
import com.yoklama.security.CurrentTeacher;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/teachers")
public class AdminTeacherController {

    static final int MIN_PASSWORD = 8;

    private final TeacherUserRepository repo;
    private final PasswordEncoder encoder;
    private final CurrentTeacher currentTeacher;

    public AdminTeacherController(TeacherUserRepository repo, PasswordEncoder encoder,
                                  CurrentTeacher currentTeacher) {
        this.repo = repo;
        this.encoder = encoder;
        this.currentTeacher = currentTeacher;
    }

    public record TeacherDto(long id, String username, String displayName, String role, boolean enabled) {
        static TeacherDto from(TeacherUser t) {
            return new TeacherDto(t.getId(), t.getUsername(), t.getDisplayName(), t.getRole().name(), t.isEnabled());
        }
    }

    public record CreateTeacherRequest(@NotBlank @Size(max = 64) @Pattern(regexp = "^[A-Za-z0-9._@-]+$") String username,
                                       @NotBlank @Size(min = MIN_PASSWORD, max = 72) String password,
                                       @NotBlank @Size(max = 120) String displayName,
                                       @NotBlank String role) {}

    public record PatchTeacherRequest(@Size(min = 1, max = 120) String displayName,
                                      @Size(min = MIN_PASSWORD, max = 72) String password,
                                      Boolean enabled) {}

    @GetMapping
    public List<TeacherDto> list() {
        return repo.findAll().stream().map(TeacherDto::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public TeacherDto create(@Valid @RequestBody CreateTeacherRequest req) {
        TeacherRole role;
        try {
            role = TeacherRole.valueOf(req.role().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, Map.of("role", "ADMIN|TEACHER"));
        }
        if (repo.existsByUsername(req.username())) {
            throw new ApiException(ErrorCode.CONFLICT, Map.of("username", "Bu kullanıcı adı zaten var"));
        }
        var teacher = new TeacherUser(req.username(), encoder.encode(req.password()),
                req.displayName().trim(), role);
        return TeacherDto.from(repo.save(teacher));
    }

    @PatchMapping("/{id}")
    @Transactional
    public TeacherDto patch(@PathVariable long id, @Valid @RequestBody PatchTeacherRequest req) {
        TeacherUser t = repo.findById(id).orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        if (Boolean.FALSE.equals(req.enabled()) && t.getId().equals(currentTeacher.get().getId())) {
            // Prevent an admin from locking themselves (and possibly everyone) out.
            throw new ApiException(ErrorCode.CONFLICT, Map.of("enabled", "Kendi hesabınızı devre dışı bırakamazsınız"));
        }
        if (req.displayName() != null && !req.displayName().isBlank()) t.setDisplayName(req.displayName().trim());
        if (req.password() != null) t.setPasswordHash(encoder.encode(req.password()));
        if (req.enabled() != null) t.setEnabled(req.enabled());
        return TeacherDto.from(repo.save(t));
    }
}
