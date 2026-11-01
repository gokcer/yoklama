package com.yoklama.crypto;

import java.nio.charset.StandardCharsets;

public final class SessionKeyDerivation {

    private SessionKeyDerivation() {}

    public static byte[] derive(byte[] masterSecret, long sessionId, String code) {
        return Hmac.sha256(masterSecret,
                ("Y1-SESSION|" + sessionId + "|" + code).getBytes(StandardCharsets.US_ASCII));
    }
}
