package com.yoklama.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

@Configuration
public class MasterSecretConfig {

    private static final Logger log = LoggerFactory.getLogger(MasterSecretConfig.class);
    static final int REQUIRED_LENGTH = 32;

    public record MasterSecret(byte[] value) {}

    @Bean
    public MasterSecret masterSecret(AppProperties props, Environment env) {
        boolean prod = Arrays.asList(env.getActiveProfiles()).contains("prod");
        String encoded = props.masterSecret();
        if (encoded != null && !encoded.isBlank()) {
            byte[] decoded;
            try {
                decoded = Base64.getDecoder().decode(encoded.trim());
            } catch (IllegalArgumentException e) {
                throw new IllegalStateException("app.master-secret (APP_MASTER_SECRET) is not valid base64");
            }
            if (decoded.length < REQUIRED_LENGTH) {
                String msg = "app.master-secret (APP_MASTER_SECRET) must decode to at least "
                        + REQUIRED_LENGTH + " bytes (got " + decoded.length + "); use `openssl rand -base64 32`";
                if (prod) throw new IllegalStateException(msg);
                log.warn(msg);
            }
            return new MasterSecret(decoded);
        }
        if (prod) {
            throw new IllegalStateException(
                    "app.master-secret (APP_MASTER_SECRET) must be set in production profile");
        }
        byte[] random = new byte[REQUIRED_LENGTH];
        new SecureRandom().nextBytes(random);
        log.warn("No master-secret configured; generated random key. "
                + "Open sessions will be invalid after restart.");
        return new MasterSecret(random);
    }
}
