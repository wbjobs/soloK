package com.powergrid.check.model.graph;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.data.neo4j.core.schema.Node;
import org.springframework.data.neo4j.core.schema.Property;

@Data
@EqualsAndHashCode(callSuper = true)
@Node("Load")
public class Load extends PowerDevice {

    @Property("ratedCapacityMW")
    private Double ratedCapacityMW;

    @Property("currentLoadMW")
    private Double currentLoadMW;

    @Property("loadFactor")
    private Double loadFactor;

    @Property("importanceLevel")
    private String importanceLevel;

    @Property("priority")
    private Integer priority;

    @Property("outageCostPerMWh")
    private Double outageCostPerMWh;

    @Property("loadType")
    private String loadType;
}
