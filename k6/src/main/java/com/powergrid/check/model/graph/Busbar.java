package com.powergrid.check.model.graph;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.data.neo4j.core.schema.Node;

@Data
@EqualsAndHashCode(callSuper = true)
@Node("Busbar")
public class Busbar extends PowerDevice {

    private String section;

    private String busType;
}
