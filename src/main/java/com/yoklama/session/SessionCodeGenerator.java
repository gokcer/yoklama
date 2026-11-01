package com.yoklama.session;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.List;

@Component
public class SessionCodeGenerator {

    private static final char[] ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final int CODE_LENGTH = 6;

    private final SecureRandom random = new SecureRandom();
    private final ClassSessionRepository repo;

    public SessionCodeGenerator(ClassSessionRepository repo) {
        this.repo = repo;
    }

    public String generate() {
        for (int attempt = 0; attempt < 100; attempt++) {
            String code = randomCode();
            if (!repo.existsByCodeAndStatusIn(code, List.of(SessionStatus.DRAFT, SessionStatus.OPEN))) {
                return code;
            }
        }
        throw new IllegalStateException("Failed to generate unique session code after 100 attempts");
    }

    private String randomCode() {
        char[] chars = new char[CODE_LENGTH];
        for (int i = 0; i < CODE_LENGTH; i++) {
            chars[i] = ALPHABET[random.nextInt(ALPHABET.length)];
        }
        return new String(chars);
    }
}
