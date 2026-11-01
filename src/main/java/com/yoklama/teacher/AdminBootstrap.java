package com.yoklama.teacher;

import com.yoklama.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class AdminBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

    private final TeacherUserRepository repo;
    private final PasswordEncoder encoder;
    private final AppProperties props;

    public AdminBootstrap(TeacherUserRepository repo, PasswordEncoder encoder, AppProperties props) {
        this.repo = repo;
        this.encoder = encoder;
        this.props = props;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (repo.count() > 0) return;

        String username = props.admin() != null ? props.admin().username() : null;
        String password = props.admin() != null ? props.admin().password() : null;

        if (username == null || username.isBlank() || password == null || password.isBlank()) {
            log.warn("No users exist and no admin credentials configured. "
                    + "Set APP_ADMIN_USERNAME and APP_ADMIN_PASSWORD to create an admin user.");
            return;
        }

        var admin = new TeacherUser(username, encoder.encode(password), "Yönetici", TeacherRole.ADMIN);
        repo.save(admin);
        log.info("Created admin user: {}", username);
    }
}
