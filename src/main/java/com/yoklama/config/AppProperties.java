package com.yoklama.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@ConfigurationProperties(prefix = "app")
@Validated
public record AppProperties(
        String masterSecret,
        String publicBaseUrl,
        @Valid Admin admin,
        String privacyNotice,
        @Valid DeviceCookie deviceCookie,
        @Valid Frames frames,
        @Valid Retention retention,
        @Valid RateLimit rateLimit,
        @Valid Ble ble,
        @Valid Checkin checkin
) {
    public record Admin(String username, String password) {}

    public record DeviceCookie(
            @NotBlank String name,
            @Positive int maxAgeDays,
            boolean secure
    ) {}

    public record Frames(
            @NotBlank String dir,
            @Positive int maxBytes,
            @Positive int retentionDays
    ) {}

    public record Retention(@Positive int attemptDays) {}

    public record RateLimit(
            @Positive int perDevicePerMinute,
            @Positive int perIpPerMinute,
            @Positive int startsPerDevicePer10min,
            @Positive int loginPerIpPerMinute
    ) {}

    public record Ble(
            String serviceUuid,
            String nonceCharUuid,
            String responseCharUuid,
            @Positive long nonceTtlMs
    ) {}

    public record Checkin(
            @Valid Defaults defaults,
            @Positive int maxClockRttMs,
            @Positive int maxGeoAccuracyM,
            boolean bleClearsLatency,
            @Positive int attemptTtlSeconds,
            @NotBlank String studentNoPattern,
            @Positive int maxScansPerAttempt
    ) {
        public record Defaults(
                @Positive int refreshMs,
                @Positive int requiredScans,
                @Positive int maxSpanSlots,
                @Positive int maxTokenAgeMs,
                @Positive int latencyMarginMs,
                @Positive int defaultLatencyThresholdMs,
                double screenAreaRatioThreshold,
                @Positive int durationMinutes,
                String geoMode,
                String bleMode,
                boolean frameCapture,
                boolean requireRoster
        ) {}
    }
}
