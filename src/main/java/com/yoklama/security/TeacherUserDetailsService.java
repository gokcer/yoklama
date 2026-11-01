package com.yoklama.security;

import com.yoklama.teacher.TeacherUser;
import com.yoklama.teacher.TeacherUserRepository;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class TeacherUserDetailsService implements UserDetailsService {

    private final TeacherUserRepository repo;

    public TeacherUserDetailsService(TeacherUserRepository repo) {
        this.repo = repo;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        TeacherUser t = repo.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
        return new User(t.getUsername(), t.getPasswordHash(),
                t.isEnabled(), true, true, true,
                List.of(new SimpleGrantedAuthority("ROLE_" + t.getRole().name())));
    }
}
