package com.yoklama.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.yoklama.common.ErrorCode;
import com.yoklama.config.AppProperties;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * In-memory rate limiting for public POST endpoints and the login endpoint (05 §7).
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Pattern DEVICE_FORMAT = Pattern.compile("^[A-Z2-7]{26}$");

    private final AppProperties props;
    private final Cache<String, Bucket> buckets = Caffeine.newBuilder()
            .expireAfterAccess(Duration.ofMinutes(15))
            .maximumSize(200_000)
            .build();

    public RateLimitFilter(AppProperties props) {
        this.props = props;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!"POST".equals(request.getMethod())) return true;
        String uri = request.getRequestURI();
        return !(uri.startsWith("/api/public/") || uri.equals("/api/auth/login"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        AppProperties.RateLimit limits = props.rateLimit();
        String uri = request.getRequestURI();
        String ip = request.getRemoteAddr();

        List<Bucket> toCheck = new ArrayList<>(3);
        if (uri.equals("/api/auth/login")) {
            toCheck.add(bucket("login:" + ip, limits.loginPerIpPerMinute(), Duration.ofMinutes(1)));
        } else {
            toCheck.add(bucket("ip:" + ip, limits.perIpPerMinute(), Duration.ofMinutes(1)));
            String device = deviceId(request);
            if (device != null) {
                toCheck.add(bucket("dev:" + device, limits.perDevicePerMinute(), Duration.ofMinutes(1)));
                if (uri.equals("/api/public/checkins")) {
                    toCheck.add(bucket("start:" + device, limits.startsPerDevicePer10min(), Duration.ofMinutes(10)));
                }
            }
        }

        for (Bucket b : toCheck) {
            ConsumptionProbe probe = b.tryConsumeAndReturnRemaining(1);
            if (!probe.isConsumed()) {
                long retryAfter = Math.max(1, TimeUnit.NANOSECONDS.toSeconds(probe.getNanosToWaitForRefill()) + 1);
                reject(response, retryAfter);
                return;
            }
        }
        chain.doFilter(request, response);
    }

    /** Clears all buckets (tests). */
    public void clear() {
        buckets.invalidateAll();
    }

    private Bucket bucket(String key, int capacity, Duration period) {
        return buckets.get(key, k -> Bucket.builder()
                .addLimit(Bandwidth.builder().capacity(capacity).refillGreedy(capacity, period).build())
                .build());
    }

    private String deviceId(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        String name = props.deviceCookie().name();
        for (Cookie c : cookies) {
            if (name.equals(c.getName()) && c.getValue() != null && DEVICE_FORMAT.matcher(c.getValue()).matches()) {
                return c.getValue();
            }
        }
        return null;
    }

    private void reject(HttpServletResponse response, long retryAfterSeconds) throws IOException {
        ErrorCode code = ErrorCode.RATE_LIMITED;
        response.setStatus(code.httpStatus().value());
        response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfterSeconds));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(JsonErrors.body(code));
    }
}
