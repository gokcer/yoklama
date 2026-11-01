package com.yoklama.checkin;

import com.yoklama.common.ApiException;
import com.yoklama.common.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.UUID;

@RestController
@RequestMapping("/api/public/checkins")
public class PublicCheckinController {

    private final CheckinService service;

    public PublicCheckinController(CheckinService service) {
        this.service = service;
    }

    public record StartRequest(@NotBlank @Size(max = 16) String sessionCode,
                               @NotBlank @Size(max = 32) String studentNo,
                               ClientInfo client) {}
    public record ClientInfo(String userAgent, String platform, Integer screenW, Integer screenH) {}
    public record StartResponse(String attemptId, String expiresAt, String studentName) {}

    public record SyncRequest(int offsetMs, int rttMs) {}

    public record ScanRequest(@NotBlank @Size(max = 256) String token,
                              @NotNull Long firstSeenServerMs,
                              @NotBlank String frameTimeSource,
                              int frameW, int frameH,
                              double[][] corners) {}

    public record BleRequest(String response) {}

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StartResponse start(@Valid @RequestBody StartRequest req,
                               @RequestAttribute("deviceId") String deviceId,
                               HttpServletRequest httpReq) {
        String ua = req.client() != null && req.client().userAgent() != null
                ? req.client().userAgent() : httpReq.getHeader("User-Agent");
        var result = service.start(req.sessionCode(), req.studentNo(), deviceId,
                httpReq.getRemoteAddr(), ua);
        return new StartResponse(result.attemptId().toString(), result.expiresAt().toString(),
                result.studentName());
    }

    @PostMapping("/{attemptId}/sync")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void sync(@PathVariable UUID attemptId, @RequestBody SyncRequest req,
                     @RequestAttribute("deviceId") String deviceId) {
        service.recordSync(attemptId, deviceId, req.offsetMs(), req.rttMs());
    }

    @PostMapping("/{attemptId}/scans")
    public CheckinService.ScanResponse scan(@PathVariable UUID attemptId,
                                            @Valid @RequestBody ScanRequest req,
                                            @RequestAttribute("deviceId") String deviceId) {
        return service.recordScan(attemptId, deviceId, req.token(), req.firstSeenServerMs(),
                req.frameTimeSource(), req.frameW(), req.frameH(), req.corners());
    }

    @PostMapping("/{attemptId}/frame")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void frame(@PathVariable UUID attemptId,
                      @RequestParam("frame") MultipartFile frame,
                      @RequestParam int seq,
                      @RequestAttribute("deviceId") String deviceId) throws IOException {
        if (frame.isEmpty()) throw new ApiException(ErrorCode.FRAME_INVALID);
        service.storeFrame(attemptId, deviceId, frame.getBytes(), seq);
    }

    @PostMapping("/{attemptId}/ble-nonce")
    public CheckinService.BleNonceResponse bleNonce(@PathVariable UUID attemptId,
                                                    @RequestAttribute("deviceId") String deviceId) {
        return service.bleNonce(attemptId, deviceId);
    }

    @PostMapping("/{attemptId}/ble")
    public CheckinService.BleVerifyResponse ble(@PathVariable UUID attemptId,
                                                @RequestBody BleRequest req,
                                                @RequestAttribute("deviceId") String deviceId) {
        return service.bleVerify(attemptId, deviceId, req.response());
    }

    @PostMapping("/{attemptId}/complete")
    public CheckinService.CompleteResponse complete(@PathVariable UUID attemptId,
                                                    @RequestBody(required = false) CheckinService.CompleteRequest req,
                                                    @RequestAttribute("deviceId") String deviceId) {
        return service.complete(attemptId, deviceId, req);
    }
}
