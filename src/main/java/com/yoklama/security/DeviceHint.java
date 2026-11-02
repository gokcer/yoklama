package com.yoklama.security;

import com.yoklama.config.MasterSecretConfig.MasterSecret;
import com.yoklama.crypto.Base32;
import com.yoklama.crypto.Hmac;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Short label for a device cookie value (02 §9) so the instructor can group the records and the
 * rejected attempts that came from the same phone. Derived from the master secret, so it cannot be
 * reversed into the {@code YD} value and it is useless without this server. Never sent to students.
 */
@Component
public class DeviceHint {

    static final int HINT_BYTES = 5;   // 40 bits -> 8 base32 characters
    private static final byte[] INFO = "device-hint/v1".getBytes(StandardCharsets.UTF_8);

    private final byte[] key;

    public DeviceHint(MasterSecret masterSecret) {
        this.key = Hmac.sha256(masterSecret.value(), INFO);
    }

    /** 8 characters for a known device, {@code null} when there is no device fingerprint. */
    public String of(String deviceId) {
        if (deviceId == null || deviceId.isBlank()) return null;
        byte[] mac = Hmac.sha256(key, deviceId.getBytes(StandardCharsets.UTF_8));
        return Base32.encode(Arrays.copyOf(mac, HINT_BYTES));
    }
}
