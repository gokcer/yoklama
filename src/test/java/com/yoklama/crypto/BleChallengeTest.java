package com.yoklama.crypto;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class BleChallengeTest {

    @Test
    void b1_vector() {
        byte[] bleKey = new byte[32];
        for (int i = 0; i < 32; i++) bleKey[i] = (byte) (0x20 + i);

        String response = BleChallenge.response(bleKey, "N7F3K9QZ2M4XW8TA");
        assertEquals("C96FAE95628876C7", response);
    }

    @Test
    void b1_verify() {
        byte[] bleKey = new byte[32];
        for (int i = 0; i < 32; i++) bleKey[i] = (byte) (0x20 + i);

        assertTrue(BleChallenge.verify(bleKey, "N7F3K9QZ2M4XW8TA", "C96FAE95628876C7"));
    }

    @Test
    void wrongResponse() {
        byte[] bleKey = new byte[32];
        for (int i = 0; i < 32; i++) bleKey[i] = (byte) (0x20 + i);

        assertFalse(BleChallenge.verify(bleKey, "N7F3K9QZ2M4XW8TA", "0000000000000000"));
    }
}
