package com.powergrid.check.model.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.redis.core.RedisHash;
import org.springframework.data.redis.core.index.Indexed;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Data
@RedisHash("operation:history")
public class OperationHistory implements Serializable {

    @Id
    private String id;

    @Indexed
    private String orderId;

    @Indexed
    private String deviceId;

    @Indexed
    private String operator;

    @Indexed
    private LocalDateTime operateTime;

    private String operationType;

    private String statusBefore;

    private String statusAfter;

    private String result;

    private String remark;

    @Indexed
    private Boolean hasViolation;

    private List<String> violationRules;
}
