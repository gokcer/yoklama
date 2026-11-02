package com.yoklama.security;

import com.yoklama.config.MasterSecretConfig.MasterSecret;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.*;

/** 02 §9 / 05 §6: the instructor-facing device label. */
class DeviceHintTest {

    static final String DEVICE = "ABCDEFGHIJKLMNOPQRSTUVWX";

    static DeviceHint hintWithSeed(byte seed) {
        byte[] key = new byte[32];
        Arrays.fill(key, seed);
        return new DeviceHint(new MasterSecret(key));
    }

    @Test
    void stableEightBase32Characters() {
        DeviceHint hint = hintWithSeed((byte) 1);
        String value = hint.of(DEVICE);
        assertNotNull(value);
        assertEquals(8, value.length());
        assertTrue(value.matches("^[A-Z2-7]{8}$"), value);
        assertEquals(value, hint.of(DEVICE));
    }

    @Test
    void differentDevicesDifferentHints() {
        DeviceHint hint = hintWithSeed((byte) 1);
        assertNotEquals(hint.of(DEVICE), hint.of("ABCDEFGHIJKLMNOPQRSTUVWY"));
    }

    @Test
    void dependsOnTheMasterSecret() {
        assertNotEquals(hintWithSeed((byte) 1).of(DEVICE), hintWithSeed((byte) 2).of(DEVICE));
    }

    @Test
    void unknownDeviceHasNoHint() {
        DeviceHint hint = hintWithSeed((byte) 1);
        assertNull(hint.of(null));
        assertNull(hint.of("   "));
    }
}
