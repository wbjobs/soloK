package com.powergrid.check.model.graph;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.data.neo4j.core.schema.Node;
import org.springframework.data.neo4j.core.schema.Property;

@Data
@EqualsAndHashCode(callSuper = true)
@Node("Transformer")
public class Transformer extends PowerDevice {

    @Property("capacity")
    private String capacity;

    @Property("windingType")
    private String windingType;

    @Property("highVoltageSide")
    private String highVoltageSide;

    @Property("lowVoltageSide")
    private String lowVoltageSide;
}
