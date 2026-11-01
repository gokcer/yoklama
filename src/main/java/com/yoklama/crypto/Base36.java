package com.yoklama.crypto;

import java.util.Locale;

public final class Base36 {

    private static final String VALID_PATTERN = "^[0-9A-Z]+$";

    private Base36() {}

    public static String encode(long value) {
        if (value < 0) {
            throw new IllegalArgumentException("Negative value: " + value);
        }
        return Long.toString(value, 36).toUpperCase(Locale.ROOT);
    }

    public static long decode(String s) {
        if (s == null || s.isEmpty() || !s.matches(VALID_PATTERN)) {
            throw new IllegalArgumentException("Invalid base36: " + s);
        }
        return Long.parseLong(s, 36);
    }
}
