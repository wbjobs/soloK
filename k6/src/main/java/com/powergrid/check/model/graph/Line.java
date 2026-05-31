package com.powergrid.check.model.graph;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.data.neo4j.core.schema.Node;
import org.springframework.data.neo4j.core.schema.Property;

@Data
@EqualsAndHashCode(callSuper = true)
@Node("Line")
public class Line extends PowerDevice {

    @Property("lineLength")
    private Double lineLength;

    @Property("lineCode")
    private String lineCode;
}
