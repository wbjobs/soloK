package com.powergrid.check.model.dto;

import lombok.Data;
import java.util.List;

@Data
public class SwitchingOrder {

    private String orderId;

    private String orderName;

    private String substation;

    private String operator;

    private String createTime;

    private List<OperationStep> operations;
}
