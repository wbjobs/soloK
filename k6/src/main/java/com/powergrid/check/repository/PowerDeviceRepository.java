package com.powergrid.check.repository;

import com.powergrid.check.model.graph.PowerDevice;
import org.springframework.data.neo4j.repository.Neo4jRepository;
import org.springframework.data.neo4j.repository.query.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public interface PowerDeviceRepository extends Neo4jRepository<PowerDevice, Long> {

    Optional<PowerDevice> findByDeviceId(String deviceId);

    @Query("MATCH (d:PowerDevice {deviceId: $deviceId}) RETURN d")
    Optional<PowerDevice> getDeviceById(@Param("deviceId") String deviceId);

    @Query("MATCH (d:PowerDevice {deviceId: $deviceId})-[r:CONNECTED_TO*1..3]-(connected) " +
           "WHERE connected.substation = d.substation " +
           "RETURN DISTINCT connected")
    List<PowerDevice> findConnectedDevices(@Param("deviceId") String deviceId);

    @Query("MATCH (d:PowerDevice {deviceId: $deviceId})-[r:CONNECTED_TO*1..3]-(connected) " +
           "WHERE connected.substation IN $substations " +
           "RETURN DISTINCT connected")
    List<PowerDevice> findConnectedDevicesInSubstations(@Param("deviceId") String deviceId,
                                                        @Param("substations") List<String> substations);

    @Query("MATCH path = (source:PowerDevice {deviceId: $sourceId})-[*1..5]-(target:PowerDevice {deviceId: $targetId}) " +
           "WHERE ALL(r IN relationships(path) WHERE " +
           "  (type(r) = 'CONNECTED_TO') AND " +
           "  (ANY(n IN nodes(path) WHERE n:Breaker AND n.status = 'CLOSED' OR NOT n:Breaker)) " +
           ") " +
           "RETURN COUNT(path) > 0")
    boolean isConductivePath(@Param("sourceId") String sourceId, @Param("targetId") String targetId);

    @Query("MATCH (d:GroundSwitch) WHERE d.status IN ['CLOSED', 'GROUNDED'] RETURN d")
    List<PowerDevice> findAllClosedGroundSwitches();

    @Query("MATCH (d:GroundSwitch) " +
           "WHERE d.status IN ['CLOSED', 'GROUNDED'] " +
           "AND d.substation = $substation " +
           "RETURN d")
    List<PowerDevice> findClosedGroundSwitchesBySubstation(@Param("substation") String substation);

    @Query("MATCH (d:GroundSwitch) " +
           "WHERE d.status IN ['CLOSED', 'GROUNDED'] " +
           "AND d.substation IN $substations " +
           "RETURN d")
    List<PowerDevice> findClosedGroundSwitchesBySubstations(@Param("substations") List<String> substations);

    @Query("MATCH (d:Breaker {deviceId: $breakerId})--(ds:Disconnector) RETURN ds")
    List<PowerDevice> findDisconnectorsByBreaker(@Param("breakerId") String breakerId);

    @Query("MATCH (d:PowerDevice {deviceId: $deviceId})--(gs:GroundSwitch) RETURN gs")
    List<PowerDevice> findGroundSwitchesByDevice(@Param("deviceId") String deviceId);

    @Query("MATCH (d:PowerDevice) WHERE d.deviceId IN $deviceIds RETURN d")
    List<PowerDevice> findByDeviceIds(@Param("deviceIds") List<String> deviceIds);

    @Query("MATCH (d:PowerDevice {deviceId: $deviceId}) " +
           "OPTIONAL MATCH path = (d)-[*1..4]-(energized:PowerDevice {status: 'ENERGIZED'}) " +
           "WHERE ALL(n IN nodes(path)[1..-1] WHERE " +
           "  n.substation = d.substation AND (" +
           "  (n:Breaker AND n.status = 'CLOSED') OR " +
           "  (n:Disconnector AND n.status = 'CLOSED') OR " +
           "  (n:Busbar) OR " +
           "  (n:Line) OR " +
           "  (n:Transformer)" +
           ")) " +
           "RETURN COUNT(path) > 0")
    boolean isDeviceEnergized(@Param("deviceId") String deviceId);

    @Query("MATCH (d:PowerDevice {deviceId: $deviceId}) " +
           "WITH d, " +
           "CASE WHEN d:Breaker AND d.isTieBreaker = true THEN [d.leftSideSubstation, d.rightSideSubstation] " +
           "ELSE [d.substation] END AS substations " +
           "OPTIONAL MATCH path = (d)-[*1..4]-(energized:PowerDevice {status: 'ENERGIZED'}) " +
           "WHERE energized.substation IN substations " +
           "AND ALL(n IN nodes(path)[1..-1] WHERE " +
           "  n.substation IN substations AND (" +
           "  (n:Breaker AND n.status = 'CLOSED') OR " +
           "  (n:Disconnector AND n.status = 'CLOSED') OR " +
           "  (n:Busbar) OR " +
           "  (n:Line) OR " +
           "  (n:Transformer)" +
           ")) " +
           "RETURN COUNT(path) > 0")
    boolean isDeviceEnergizedWithSubstationCheck(@Param("deviceId") String deviceId);

    @Query("MATCH (b:Breaker {deviceId: $breakerId, isTieBreaker: true}) " +
           "WITH b, b.leftSideSubstation AS leftSub, b.rightSideSubstation AS rightSub " +
           "OPTIONAL MATCH leftPath = (b)-[*1..3]-(leftEnergized:PowerDevice {status: 'ENERGIZED'}) " +
           "WHERE leftEnergized.substation = leftSub " +
           "AND ALL(n IN nodes(leftPath)[1..-1] WHERE " +
           "  n.substation = leftSub AND (" +
           "  (n:Breaker AND n.status = 'CLOSED') OR " +
           "  (n:Disconnector AND n.status = 'CLOSED') OR " +
           "  (n:Busbar) OR " +
           "  (n:Line) OR " +
           "  (n:Transformer)" +
           ")) " +
           "WITH b, COUNT(leftPath) > 0 AS leftEnergized " +
           "OPTIONAL MATCH rightPath = (b)-[*1..3]-(rightEnergized:PowerDevice {status: 'ENERGIZED'}) " +
           "WHERE rightEnergized.substation = b.rightSideSubstation " +
           "AND ALL(n IN nodes(rightPath)[1..-1] WHERE " +
           "  n.substation = b.rightSideSubstation AND (" +
           "  (n:Breaker AND n.status = 'CLOSED') OR " +
           "  (n:Disconnector AND n.status = 'CLOSED') OR " +
           "  (n:Busbar) OR " +
           "  (n:Line) OR " +
           "  (n:Transformer)" +
           ")) " +
           "RETURN leftEnergized, COUNT(rightPath) > 0 AS rightEnergized")
    Map<String, Object> checkTieBreakerBothSidesEnergized(@Param("breakerId") String breakerId);

    @Query("MATCH (d:Disconnector {deviceId: $disconnectorId})--(b:Breaker) RETURN b")
    Optional<PowerDevice> findAssociatedBreaker(@Param("disconnectorId") String disconnectorId);
}
