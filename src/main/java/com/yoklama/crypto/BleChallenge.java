package com.yoklama.crypto;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HexFormat;

public final class BleChallenge {

    private BleChallenge() {}

    public static String response(byte[] bleKey, String nonce) {
        byte[] mac = Hmac.sha256(bleKey, nonce.getBytes(StandardCharsets.US_ASCII));
        return HexFormat.of().withUpperCase().formatHex(Arrays.copyOf(mac, 8));
    }

    public static boolean verify(byte[] bleKey, String nonce, String response) {
        String expected = response(bleKey, nonce);
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.US_ASCII),
                response.getBytes(StandardCharsets.US_ASCII));
    }
}
