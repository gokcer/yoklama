package com.yoklama.security;

import com.yoklama.common.ApiException;
import com.yoklama.common.ErrorCode;
import com.yoklama.teacher.TeacherRole;
import com.yoklama.teacher.TeacherUser;
import com.yoklama.teacher.TeacherUserRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class CurrentTeacher {

    private final TeacherUserRepository repo;

    public CurrentTeacher(TeacherUserRepository repo) {
        this.repo = repo;
    }

    public TeacherUser get() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new ApiException(ErrorCode.UNAUTHORIZED);
        }
        return repo.findByUsername(auth.getName())
                .filter(TeacherUser::isEnabled)
                .orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED));
    }

    public void requireOwner(Long ownerId) {
        TeacherUser current = get();
        if (current.getRole() == TeacherRole.ADMIN) return;
        if (!current.getId().equals(ownerId)) {
            throw new ApiException(ErrorCode.FORBIDDEN);
        }
    }
}
