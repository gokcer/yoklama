package com.yoklama.common;

import java.util.Map;

public class ApiException extends RuntimeException {

    private final ErrorCode code;
    private final Map<String, Object> details;

    public ApiException(ErrorCode code) {
        super(code.message());
        this.code = code;
        this.details = Map.of();
    }

    public ApiException(ErrorCode code, Map<String, Object> details) {
        super(code.message());
        this.code = code;
        this.details = details != null ? details : Map.of();
    }

    public ErrorCode code() { return code; }
    public Map<String, Object> details() { return details; }
}
