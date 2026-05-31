package com.powergrid.check.config;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;
import java.util.stream.Collectors;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(Exception e) {
        log.error("系统异常", e);
        ErrorResponse error = new ErrorResponse();
        error.setCode("SYSTEM_ERROR");
        error.setMessage("系统内部错误: " + e.getMessage());
        error.setTimestamp(LocalDateTime.now().toString());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgumentException(IllegalArgumentException e) {
        log.warn("参数异常: {}", e.getMessage());
        ErrorResponse error = new ErrorResponse();
        error.setCode("INVALID_ARGUMENT");
        error.setMessage(e.getMessage());
        error.setTimestamp(LocalDateTime.now().toString());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(MethodArgumentNotValidException e) {
        String errors = e.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .collect(Collectors.joining(", "));
        log.warn("参数校验失败: {}", errors);
        ErrorResponse error = new ErrorResponse();
        error.setCode("VALIDATION_ERROR");
        error.setMessage("参数校验失败: " + errors);
        error.setTimestamp(LocalDateTime.now().toString());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    @ExceptionHandler(BindException.class)
    public ResponseEntity<ErrorResponse> handleBindException(BindException e) {
        String errors = e.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .collect(Collectors.joining(", "));
        log.warn("参数绑定失败: {}", errors);
        ErrorResponse error = new ErrorResponse();
        error.setCode("BIND_ERROR");
        error.setMessage("参数绑定失败: " + errors);
        error.setTimestamp(LocalDateTime.now().toString());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    @Data
    public static class ErrorResponse {
        private String code;
        private String message;
        private String timestamp;
    }
}
