package com.powergrid.check.model.graph;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.data.neo4j.core.schema.Node;
import org.springframework.data.neo4j.core.schema.Property;

@Data
@EqualsAndHashCode(callSuper = true)
@Node("GroundSwitch")
public class GroundSwitch extends PowerDevice {

    @Property("location")
    private String location;

    @Property("associatedDeviceId")
    private String associatedDeviceId;

    public boolean isClosed() {
        return "CLOSED".equals(this.getStatus()) || "GROUNDED".equals(this.getStatus());
    }
}
