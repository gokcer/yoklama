package com.yoklama.common;

import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    public record ErrorResponseBody(String code, String message, Map<String, Object> details) {}

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponseBody> handleApi(ApiException ex) {
        return of(ex.code(), ex.details());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponseBody> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, Object> fields = new HashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            fields.put(fe.getField(), fe.getDefaultMessage());
        }
        return of(ErrorCode.VALIDATION_ERROR, fields);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponseBody> handleConstraint(ConstraintViolationException ex) {
        Map<String, Object> fields = new HashMap<>();
        ex.getConstraintViolations().forEach(v -> fields.put(v.getPropertyPath().toString(), v.getMessage()));
        return of(ErrorCode.VALIDATION_ERROR, fields);
    }

    @ExceptionHandler({
            HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class,
            MissingServletRequestPartException.class,
            HandlerMethodValidationException.class,
    })
    public ResponseEntity<ErrorResponseBody> handleBadRequest(Exception ex) {
        return of(ErrorCode.VALIDATION_ERROR, Map.of());
    }

    @ExceptionHandler({MaxUploadSizeExceededException.class, MultipartException.class})
    public ResponseEntity<ErrorResponseBody> handleUpload(Exception ex) {
        return of(ErrorCode.FRAME_INVALID, Map.of());
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ErrorResponseBody> handleAuthentication(AuthenticationException ex) {
        return of(ErrorCode.UNAUTHORIZED, Map.of());
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponseBody> handleAccessDenied(AccessDeniedException ex) {
        return of(ErrorCode.FORBIDDEN, Map.of());
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ErrorResponseBody> handleNotFound(NoResourceFoundException ex) {
        return of(ErrorCode.NOT_FOUND, Map.of());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponseBody> handleIntegrity(DataIntegrityViolationException ex) {
        log.warn("Data integrity violation: {}", ex.getMostSpecificCause().getMessage());
        return of(ErrorCode.CONFLICT, Map.of());
    }

    @ExceptionHandler(AsyncRequestNotUsableException.class)
    public void handleAsyncNotUsable(AsyncRequestNotUsableException ex) {
        // Client went away (typically an SSE stream); nothing to write.
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponseBody> handleUnexpected(Exception ex) {
        if (ex instanceof ErrorResponse er && er.getStatusCode().is4xxClientError()) {
            // Other Spring MVC exceptions (405, 406, 415, ...) keep their own status.
            HttpStatusCode status = er.getStatusCode();
            HttpStatus resolved = HttpStatus.resolve(status.value());
            return ResponseEntity.status(status).body(new ErrorResponseBody(
                    resolved != null ? resolved.name() : "BAD_REQUEST", "İstek desteklenmiyor.", Map.of()));
        }
        log.error("Unexpected error", ex);
        return of(ErrorCode.INTERNAL, Map.of());
    }

    private static ResponseEntity<ErrorResponseBody> of(ErrorCode code, Map<String, Object> details) {
        return ResponseEntity.status(code.httpStatus())
                .body(new ErrorResponseBody(code.name(), code.message(), details));
    }
}
