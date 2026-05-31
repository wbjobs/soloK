package com.powergrid.check.model.graph;

import lombok.Data;
import org.springframework.data.neo4j.core.schema.RelationshipProperties;
import org.springframework.data.neo4j.core.schema.TargetNode;

@Data
@RelationshipProperties
public class Connection {

    @TargetNode
    private PowerDevice target;

    private String connectionType;

    private String description;
}
