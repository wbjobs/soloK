package com.powergrid.check.model.graph;

import lombok.Data;
import org.springframework.data.neo4j.core.schema.*;

import java.util.HashSet;
import java.util.Set;

@Data
@Node("PowerDevice")
public abstract class PowerDevice {

    @Id
    @GeneratedValue
    private Long id;

    @Property("deviceId")
    private String deviceId;

    @Property("name")
    private String name;

    @Property("voltageLevel")
    private String voltageLevel;

    @Property("status")
    private String status;

    @Property("substation")
    private String substation;

    @Relationship(type = "CONNECTED_TO", direction = Relationship.Direction.OUTGOING)
    private Set<Connection> connections = new HashSet<>();

    public void addConnection(PowerDevice target, String connectionType) {
        Connection connection = new Connection();
        connection.setTarget(target);
        connection.setConnectionType(connectionType);
        this.connections.add(connection);
    }

    public boolean isEnergized() {
        return "ENERGIZED".equals(this.status);
    }

    public boolean isOpen() {
        return "OPEN".equals(this.status);
    }

    public boolean isClosed() {
        return "CLOSED".equals(this.status);
    }

    public boolean isGrounded() {
        return "GROUNDED".equals(this.status);
    }
}
