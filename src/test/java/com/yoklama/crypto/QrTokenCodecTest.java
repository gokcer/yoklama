package com.yoklama.crypto;

import org.junit.jupiter.api.Test;

import java.util.HexFormat;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class QrTokenCodecTest {

    private static final byte[] SESSION_KEY = new byte[32];
    static {
        for (int i = 0; i < 32; i++) SESSION_KEY[i] = (byte) i;
    }

    @Test
    void t1_sign() {
        String token = QrTokenCodec.sign(SESSION_KEY, "ABC234", 7, 1760000000000L);
        assertEquals("Y1.ABC234.7.MGJ6K3CW.77B7SI2E54AA2", token);
    }

    @Test
    void t2_sign() {
        String token = QrTokenCodec.sign(SESSION_KEY, "K7Q2ZP", 1295, 1760000001500L);
        assertEquals("Y1.K7Q2ZP.ZZ.MGJ6K4IK.NNSGYSRVIIHIU", token);
    }

    @Test
    void t3_sign() {
        String token = QrTokenCodec.sign(SESSION_KEY, "ABC234", 0, 1760000000000L);
        assertEquals("Y1.ABC234.0.MGJ6K3CW.SGERQ6UXA4VUK", token);
    }

    @Test
    void t1_fullHmac() {
        String prefix = QrTokenCodec.prefix("ABC234", 7, 1760000000000L);
        byte[] mac = Hmac.sha256(SESSION_KEY, prefix.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        assertEquals("ffc3f92344ef000dc46db591f4b5583f5cc46bd7224a91b0717261c73b6d669e",
                HexFormat.of().formatHex(mac));
    }

    @Test
    void t1_parse() {
        Optional<QrToken> result = QrTokenCodec.parse("Y1.ABC234.7.MGJ6K3CW.77B7SI2E54AA2");
        assertTrue(result.isPresent());
        QrToken t = result.get();
        assertEquals("ABC234", t.code());
        assertEquals(7, t.seq());
        assertEquals(1760000000000L, t.ts());
    }

    @Test
    void t1_verify() {
        QrToken t = QrTokenCodec.parse("Y1.ABC234.7.MGJ6K3CW.77B7SI2E54AA2").orElseThrow();
        assertTrue(QrTokenCodec.verify(SESSION_KEY, t));
    }

    @Test
    void t2_verify() {
        QrToken t = QrTokenCodec.parse("Y1.K7Q2ZP.ZZ.MGJ6K4IK.NNSGYSRVIIHIU").orElseThrow();
        assertTrue(QrTokenCodec.verify(SESSION_KEY, t));
    }

    @Test
    void t3_verify() {
        QrToken t = QrTokenCodec.parse("Y1.ABC234.0.MGJ6K3CW.SGERQ6UXA4VUK").orElseThrow();
        assertTrue(QrTokenCodec.verify(SESSION_KEY, t));
    }

    @Test
    void e2e_kd1_vector() {
        byte[] masterSecret = new byte[32];
        for (int i = 0; i < 32; i++) masterSecret[i] = (byte) i;
        byte[] sessionKey = SessionKeyDerivation.derive(masterSecret, 42, "ABC234");
        String token = QrTokenCodec.sign(sessionKey, "ABC234", 7, 1760000000000L);
        assertEquals("Y1.ABC234.7.MGJ6K3CW.5II22G743573Q", token);
    }

    @Test
    void negative_tampered() {
        QrToken t = QrTokenCodec.parse("Y1.ABC234.7.MGJ6K3CW.77B7SI2E54AA3").orElseThrow();
        assertFalse(QrTokenCodec.verify(SESSION_KEY, t));
    }

    @Test
    void negative_lowercase() {
        Optional<QrToken> result = QrTokenCodec.parse("y1.abc234.7.mgj6k3cw.77b7si2e54aa2");
        assertTrue(result.isEmpty());
    }

    @Test
    void negative_invalidCodeAlphabet() {
        Optional<QrToken> result = QrTokenCodec.parse("Y1.ABC1O3.7.MGJ6K3CW.77B7SI2E54AA2");
        assertTrue(result.isEmpty());
    }

    @Test
    void negative_leadingZeroSeq() {
        String token = "Y1.ABC234.07.MGJ6K3CW." + "SGERQ6UXA4VUK";
        Optional<QrToken> parsed = QrTokenCodec.parse(token);
        if (parsed.isPresent()) {
            assertFalse(QrTokenCodec.verify(SESSION_KEY, parsed.get()));
        }
    }

    @Test
    void parseNull() {
        assertTrue(QrTokenCodec.parse(null).isEmpty());
    }

    @Test
    void parseGarbage() {
        assertTrue(QrTokenCodec.parse("NOT_A_TOKEN").isEmpty());
    }
}
