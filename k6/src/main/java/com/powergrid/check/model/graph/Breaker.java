package com.powergrid.check.model.graph;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.data.neo4j.core.schema.Node;
import org.springframework.data.neo4j.core.schema.Property;

@Data
@EqualsAndHashCode(callSuper = true)
@Node("Breaker")
public class Breaker extends PowerDevice {

    @Property("ratedCurrent")
    private String ratedCurrent;

    @Property("type")
    private String type;

    @Property("hasLoad")
    private Boolean hasLoad;

    @Property("isTieBreaker")
    private Boolean isTieBreaker;

    @Property("leftSideSubstation")
    private String leftSideSubstation;

    @Property("rightSideSubstation")
    private String rightSideSubstation;

    public boolean hasLoadCurrent() {
        return Boolean.TRUE.equals(hasLoad);
    }

    public boolean isTieBreaker() {
        return Boolean.TRUE.equals(isTieBreaker);
    }
}
