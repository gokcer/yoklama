package com.yoklama.security;

import com.yoklama.teacher.TeacherUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthenticationManager authManager;
    private final SecurityContextRepository ctxRepo;
    private final CurrentTeacher currentTeacher;

    public AuthController(AuthenticationManager authManager,
                          SecurityContextRepository ctxRepo,
                          CurrentTeacher currentTeacher) {
        this.authManager = authManager;
        this.ctxRepo = ctxRepo;
        this.currentTeacher = currentTeacher;
    }

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {}
    public record MeDto(long id, String username, String displayName, String role) {
        static MeDto from(TeacherUser t) {
            return new MeDto(t.getId(), t.getUsername(), t.getDisplayName(), t.getRole().name());
        }
    }

    @GetMapping("/csrf")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void csrf(CsrfToken csrfToken) {
        // Loading the deferred token makes the repository write the XSRF-TOKEN cookie.
        csrfToken.getToken();
    }

    @PostMapping("/login")
    public MeDto login(@Valid @RequestBody LoginRequest req,
                       HttpServletRequest request, HttpServletResponse response) {
        // BadCredentialsException / DisabledException are mapped to 401 by GlobalExceptionHandler.
        Authentication auth = authManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(req.username(), req.password()));
        request.getSession(true);
        request.changeSessionId();
        SecurityContext ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(auth);
        SecurityContextHolder.setContext(ctx);
        ctxRepo.saveContext(ctx, request, response);
        return MeDto.from(currentTeacher.get());
    }

    @GetMapping("/me")
    public MeDto me() {
        return MeDto.from(currentTeacher.get());
    }
}
