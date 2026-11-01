package com.yoklama.support;

import com.yoklama.crypto.QrTokenCodec;
import com.yoklama.crypto.SessionKeyDerivation;

/** Builds tokens exactly as the display does, using the test master secret (00..1f). */
public final class TestTokens {

    public static final byte[] MASTER = new byte[32];
    static { for (int i = 0; i < 32; i++) MASTER[i] = (byte) i; }

    private TestTokens() {}

    public static long ts(long epochStartMs, int refreshMs, int seq) {
        return epochStartMs + (long) seq * refreshMs;
    }

    public static String forSession(long sessionId, String code, long epochStartMs, int refreshMs, int seq) {
        byte[] key = SessionKeyDerivation.derive(MASTER, sessionId, code);
        return QrTokenCodec.sign(key, code, seq, ts(epochStartMs, refreshMs, seq));
    }
}
