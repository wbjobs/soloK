package com.powergrid.check.model.graph;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.data.neo4j.core.schema.Node;
import org.springframework.data.neo4j.core.schema.Property;

@Data
@EqualsAndHashCode(callSuper = true)
@Node("Disconnector")
public class Disconnector extends PowerDevice {

    public enum SideType {
        BUS_SIDE,
        LINE_SIDE
    }

    @Property("sideType")
    private String sideType;

    @Property("associatedBreakerId")
    private String associatedBreakerId;

    public boolean isBusSide() {
        return SideType.BUS_SIDE.name().equals(this.sideType);
    }

    public boolean isLineSide() {
        return SideType.LINE_SIDE.name().equals(this.sideType);
    }
}
