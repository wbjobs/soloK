package com.powergrid.check.model.entity;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.redis.core.RedisHash;
import org.springframework.data.redis.core.index.Indexed;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Data
@RedisHash("violation:case")
public class ViolationCase implements Serializable {

    @Id
    private String id;

    @Indexed
    private String caseId;

    @Indexed
    private String ruleName;

    @Indexed
    private String severity;

    private String title;

    private String description;

    private String deviceType;

    private List<String> involvedDevices;

    private String riskAnalysis;

    private String correctOperation;

    private String preventiveMeasures;

    @Indexed
    private LocalDateTime createTime;

    @Indexed
    private LocalDateTime updateTime;

    private Integer occurrenceCount;
}
