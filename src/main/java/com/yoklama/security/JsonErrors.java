package com.yoklama.security;

import com.yoklama.common.ErrorCode;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Writes the standard error body from servlet filters/handlers that run outside MVC. */
final class JsonErrors {

    private JsonErrors() {}

    static String body(ErrorCode code) {
        return "{\"code\":\"" + code.name() + "\",\"message\":\"" + escape(code.message()) + "\",\"details\":{}}";
    }

    static void write(HttpServletResponse response, ErrorCode code) throws IOException {
        if (response.isCommitted()) return;
        response.setStatus(code.httpStatus().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(body(code));
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
