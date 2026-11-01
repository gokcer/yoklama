package com.yoklama.common;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    VALIDATION_ERROR(HttpStatus.BAD_REQUEST, "Girilen bilgiler geçersiz."),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "Yetkisiz."),
    FORBIDDEN(HttpStatus.FORBIDDEN, "Erişim reddedildi."),
    NOT_FOUND(HttpStatus.NOT_FOUND, "Bulunamadı."),
    SESSION_NOT_FOUND(HttpStatus.NOT_FOUND, "Yoklama bulunamadı. Kodu kontrol edin."),
    SESSION_NOT_OPEN(HttpStatus.CONFLICT, "Bu yoklama şu anda açık değil."),
    NOT_IN_ROSTER(HttpStatus.CONFLICT, "Bu öğrenci numarası dersin listesinde yok."),
    ALREADY_CHECKED_IN(HttpStatus.CONFLICT, "Bu öğrenci numarası için yoklama zaten alınmış."),
    DEVICE_ALREADY_USED(HttpStatus.CONFLICT, "Bu cihazdan bu yoklama için zaten kayıt yapılmış."),
    ATTEMPT_NOT_FOUND(HttpStatus.NOT_FOUND, "Oturumunuz bulunamadı, baştan başlayın."),
    ATTEMPT_EXPIRED(HttpStatus.GONE, "Süre doldu, lütfen tekrar deneyin."),
    NOT_ENOUGH_SCANS(HttpStatus.CONFLICT, "QR okutma tamamlanmadı, tekrar deneyin."),
    BLE_NONCE_EXPIRED(HttpStatus.GONE, "Bluetooth doğrulaması zaman aşımına uğradı."),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "Çok fazla deneme. Biraz bekleyin."),
    FRAME_INVALID(HttpStatus.BAD_REQUEST, "Kare geçersiz."),
    CONFLICT(HttpStatus.CONFLICT, "Çakışma."),
    INTERNAL(HttpStatus.INTERNAL_SERVER_ERROR, "Beklenmeyen bir hata oluştu.");

    private final HttpStatus httpStatus;
    private final String message;

    ErrorCode(HttpStatus httpStatus, String message) {
        this.httpStatus = httpStatus;
        this.message = message;
    }

    public HttpStatus httpStatus() { return httpStatus; }
    public String message() { return message; }
}
