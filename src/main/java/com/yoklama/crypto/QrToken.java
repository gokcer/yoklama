package com.yoklama.crypto;

public record QrToken(String code, int seq, long ts, String raw) {}
