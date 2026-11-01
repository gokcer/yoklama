package com.yoklama.crypto;

import org.junit.jupiter.api.Test;

import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.*;

class SessionKeyDerivationTest {

    @Test
    void kd1_vector() {
        byte[] masterSecret = new byte[32];
        for (int i = 0; i < 32; i++) masterSecret[i] = (byte) i;

        byte[] sessionKey = SessionKeyDerivation.derive(masterSecret, 42, "ABC234");

        assertEquals("f03322a3f7b40ac4ae6815c92a6404daeea905c08cd225d2fc2d151f3ff417ae",
                HexFormat.of().formatHex(sessionKey));
    }
}
