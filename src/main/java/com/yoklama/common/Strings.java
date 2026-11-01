package com.yoklama.common;

public final class Strings {

    private Strings() {}

    /** Trims and cuts a client-supplied value to the column length; blank becomes null. */
    public static String clip(String value, int maxLength) {
        if (value == null) return null;
        String t = value.trim();
        if (t.isEmpty()) return null;
        return t.length() <= maxLength ? t : t.substring(0, maxLength);
    }
}
