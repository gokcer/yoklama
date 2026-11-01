package com.yoklama.security;

import com.yoklama.config.AppProperties;
import com.yoklama.crypto.Base32;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.regex.Pattern;

@Component
public class DeviceCookieFilter extends OncePerRequestFilter {

    private static final Pattern VALID_FORMAT = Pattern.compile("^[A-Z2-7]{26}$");
    private final AppProperties props;
    private final SecureRandom random = new SecureRandom();

    public DeviceCookieFilter(AppProperties props) {
        this.props = props;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/public/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String value = findCookie(request, props.deviceCookie().name());

        if (value == null || !VALID_FORMAT.matcher(value).matches()) {
            byte[] bytes = new byte[16];
            random.nextBytes(bytes);
            value = Base32.encode(bytes);

            ResponseCookie cookie = ResponseCookie.from(props.deviceCookie().name(), value)
                    .httpOnly(true)
                    .secure(props.deviceCookie().secure())
                    .sameSite("Lax")
                    .path("/")
                    .maxAge(Duration.ofDays(props.deviceCookie().maxAgeDays()))
                    .build();
            response.addHeader("Set-Cookie", cookie.toString());
        }

        request.setAttribute("deviceId", value);
        chain.doFilter(request, response);
    }

    private String findCookie(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        for (Cookie c : cookies) {
            if (name.equals(c.getName())) return c.getValue();
        }
        return null;
    }
}
