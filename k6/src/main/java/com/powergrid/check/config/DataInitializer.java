package com.powergrid.check.config;

import com.powergrid.check.model.graph.*;
import com.powergrid.check.repository.PowerDeviceRepository;
import com.powergrid.check.service.OperationHistoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final PowerDeviceRepository powerDeviceRepository;
    private final OperationHistoryService operationHistoryService;

    @Override
    public void run(String... args) {
        initializeSampleData();
        operationHistoryService.initializeViolationCases();
    }

    private void initializeSampleData() {
        if (powerDeviceRepository.count() > 0) {
            log.info("图数据库已存在数据，跳过初始化");
            return;
        }

        log.info("开始初始化电网拓扑数据...");

        Busbar busbar1 = createBusbar("BUS-101", "110kV I段母线", "110kV", "ENERGIZED", "I段", "MAIN");
        Busbar busbar2 = createBusbar("BUS-102", "110kV II段母线", "110kV", "ENERGIZED", "II段", "MAIN");
        Busbar busbar35_1 = createBusbar("BUS-35-1", "35kV I段母线", "35kV", "DE_ENERGIZED", "I段", "MAIN");

        Breaker cb101 = createBreaker("CB-101", "110kV进线断路器", "110kV", "CLOSED", true, "SF6");
        Breaker cb201 = createBreaker("CB-201", "主变高压侧断路器", "110kV", "OPEN", false, "SF6");
        Breaker cb301 = createBreaker("CB-301", "主变低压侧断路器", "35kV", "OPEN", false, "SF6");
        Breaker cb302 = createBreaker("CB-302", "35kV馈线断路器", "35kV", "OPEN", false, "SF6");

        Busbar busbarSub2 = createBusbar("BUS-201", "110kV SUB-II I段母线", "110kV", "ENERGIZED", "I段", "MAIN");
        busbarSub2.setSubstation("SUB-II");

        Breaker tieBreaker1 = createTieBreaker("TIE-101", "110kV联络断路器", "110kV", "OPEN",
                "TEST_SUB", "SUB-II");

        Disconnector ds101_bus = createDisconnector("DS-101-BUS", "110kV进线母线侧刀闸", "110kV",
                "CLOSED", "BUS_SIDE", "CB-101");
        Disconnector ds101_line = createDisconnector("DS-101-LINE", "110kV进线线路侧刀闸", "110kV",
                "CLOSED", "LINE_SIDE", "CB-101");
        Disconnector ds201_bus = createDisconnector("DS-201-BUS", "主变高压侧母线侧刀闸", "110kV",
                "OPEN", "BUS_SIDE", "CB-201");
        Disconnector ds201_line = createDisconnector("DS-201-LINE", "主变高压侧线路侧刀闸", "110kV",
                "OPEN", "LINE_SIDE", "CB-201");
        Disconnector ds301_bus = createDisconnector("DS-301-BUS", "主变低压侧母线侧刀闸", "35kV",
                "OPEN", "BUS_SIDE", "CB-301");
        Disconnector ds301_line = createDisconnector("DS-301-LINE", "主变低压侧线路侧刀闸", "35kV",
                "OPEN", "LINE_SIDE", "CB-301");
        Disconnector ds302_bus = createDisconnector("DS-302-BUS", "35kV馈线母线侧刀闸", "35kV",
                "OPEN", "BUS_SIDE", "CB-302");
        Disconnector ds302_line = createDisconnector("DS-302-LINE", "35kV馈线线路侧刀闸", "35kV",
                "OPEN", "LINE_SIDE", "CB-302");

        GroundSwitch gnd101 = createGroundSwitch("GND-101", "110kV线路侧接地刀闸", "110kV",
                "OPEN", "LINE_SIDE", "CB-101");
        GroundSwitch gnd201 = createGroundSwitch("GND-201", "主变高压侧接地刀闸", "110kV",
                "OPEN", "TRANSFORMER_SIDE", "CB-201");
        GroundSwitch gnd301 = createGroundSwitch("GND-301", "主变低压侧接地刀闸", "35kV",
                "OPEN", "TRANSFORMER_SIDE", "CB-301");
        GroundSwitch gnd302 = createGroundSwitch("GND-302", "35kV馈线接地刀闸", "35kV",
                "OPEN", "LINE_SIDE", "CB-302");

        Line line1 = createLine("LINE-101", "110kV进线线路", "110kV", "ENERGIZED", 10.5, "L110-001");
        Line line2 = createLine("LINE-301", "35kV出线线路", "35kV", "DE_ENERGIZED", 5.2, "L35-001");

        Transformer transformer1 = createTransformer("TR-101", "1#主变压器", "110kV", "DE_ENERGIZED",
                "50MVA", "THREE_WINDING", "110kV", "35kV");

        Load load1 = createLoad("LOAD-001", "医院重要负荷", "35kV", "DE_ENERGIZED",
                10.0, 8.5, "CRITICAL", 1, 5000.0, "HOSPITAL");
        Load load2 = createLoad("LOAD-002", "工厂二级负荷", "35kV", "DE_ENERGIZED",
                20.0, 15.0, "IMPORTANT", 2, 2000.0, "INDUSTRIAL");
        Load load3 = createLoad("LOAD-003", "居民普通负荷", "35kV", "DE_ENERGIZED",
                15.0, 10.0, "NORMAL", 3, 500.0, "RESIDENTIAL");

        powerDeviceRepository.saveAll(new ArrayList<>(Arrays.asList(
                busbar1, busbar2, busbar35_1, busbarSub2,
                cb101, cb201, cb301, cb302, tieBreaker1,
                ds101_bus, ds101_line, ds201_bus, ds201_line,
                ds301_bus, ds301_line, ds302_bus, ds302_line,
                gnd101, gnd201, gnd301, gnd302,
                line1, line2,
                transformer1,
                load1, load2, load3
        )));

        establishConnections(
                line1, ds101_line, cb101, ds101_bus, busbar1,
                busbar1, ds201_bus, cb201, ds201_line, transformer1,
                transformer1, ds301_line, cb301, ds301_bus, busbar35_1,
                busbar35_1, ds302_bus, cb302, ds302_line, line2,
                line2, load1,
                line2, load2,
                line2, load3
        );

        log.info("电网拓扑数据初始化完成，共创建{}个设备节点", 27);
    }

    private void establishConnections(Object... devices) {
        for (int i = 0; i < devices.length - 1; i++) {
            if (devices[i] instanceof PowerDevice && devices[i + 1] instanceof PowerDevice) {
                PowerDevice dev1 = (PowerDevice) devices[i];
                PowerDevice dev2 = (PowerDevice) devices[i + 1];

                Optional<PowerDevice> saved1 = powerDeviceRepository.findByDeviceId(dev1.getDeviceId());
                Optional<PowerDevice> saved2 = powerDeviceRepository.findByDeviceId(dev2.getDeviceId());

                if (saved1.isPresent() && saved2.isPresent()) {
                    PowerDevice d1 = saved1.get();
                    PowerDevice d2 = saved2.get();
                    d1.addConnection(d2, "DIRECT");
                    d2.addConnection(d1, "DIRECT");
                    powerDeviceRepository.save(d1);
                    powerDeviceRepository.save(d2);
                    log.debug("建立连接: {} <-> {}", d1.getDeviceId(), d2.getDeviceId());
                }
            }
        }
    }

    private Busbar createBusbar(String deviceId, String name, String voltage, String status,
                                String section, String busType) {
        Busbar busbar = new Busbar();
        busbar.setDeviceId(deviceId);
        busbar.setName(name);
        busbar.setVoltageLevel(voltage);
        busbar.setStatus(status);
        busbar.setSubstation("TEST_SUB");
        busbar.setSection(section);
        busbar.setBusType(busType);
        return busbar;
    }

    private Breaker createBreaker(String deviceId, String name, String voltage, String status,
                                  boolean hasLoad, String type) {
        Breaker breaker = new Breaker();
        breaker.setDeviceId(deviceId);
        breaker.setName(name);
        breaker.setVoltageLevel(voltage);
        breaker.setStatus(status);
        breaker.setSubstation("TEST_SUB");
        breaker.setHasLoad(hasLoad);
        breaker.setType(type);
        breaker.setRatedCurrent("1250A");
        breaker.setIsTieBreaker(false);
        return breaker;
    }

    private Breaker createTieBreaker(String deviceId, String name, String voltage, String status,
                                     String leftSubstation, String rightSubstation) {
        Breaker breaker = new Breaker();
        breaker.setDeviceId(deviceId);
        breaker.setName(name);
        breaker.setVoltageLevel(voltage);
        breaker.setStatus(status);
        breaker.setSubstation("TIE");
        breaker.setHasLoad(true);
        breaker.setType("TIE");
        breaker.setRatedCurrent("2000A");
        breaker.setIsTieBreaker(true);
        breaker.setLeftSideSubstation(leftSubstation);
        breaker.setRightSideSubstation(rightSubstation);
        return breaker;
    }

    private Disconnector createDisconnector(String deviceId, String name, String voltage, String status,
                                            String sideType, String associatedBreakerId) {
        Disconnector ds = new Disconnector();
        ds.setDeviceId(deviceId);
        ds.setName(name);
        ds.setVoltageLevel(voltage);
        ds.setStatus(status);
        ds.setSubstation("TEST_SUB");
        ds.setSideType(sideType);
        ds.setAssociatedBreakerId(associatedBreakerId);
        return ds;
    }

    private GroundSwitch createGroundSwitch(String deviceId, String name, String voltage, String status,
                                            String location, String associatedDeviceId) {
        GroundSwitch gs = new GroundSwitch();
        gs.setDeviceId(deviceId);
        gs.setName(name);
        gs.setVoltageLevel(voltage);
        gs.setStatus(status);
        gs.setSubstation("TEST_SUB");
        gs.setLocation(location);
        gs.setAssociatedDeviceId(associatedDeviceId);
        return gs;
    }

    private Line createLine(String deviceId, String name, String voltage, String status,
                            double length, String lineCode) {
        Line line = new Line();
        line.setDeviceId(deviceId);
        line.setName(name);
        line.setVoltageLevel(voltage);
        line.setStatus(status);
        line.setSubstation("TEST_SUB");
        line.setLineLength(length);
        line.setLineCode(lineCode);
        return line;
    }

    private Transformer createTransformer(String deviceId, String name, String voltage, String status,
                                          String capacity, String windingType, String highSide, String lowSide) {
        Transformer transformer = new Transformer();
        transformer.setDeviceId(deviceId);
        transformer.setName(name);
        transformer.setVoltageLevel(voltage);
        transformer.setStatus(status);
        transformer.setSubstation("TEST_SUB");
        transformer.setCapacity(capacity);
        transformer.setWindingType(windingType);
        transformer.setHighVoltageSide(highSide);
        transformer.setLowVoltageSide(lowSide);
        return transformer;
    }

    private Load createLoad(String deviceId, String name, String voltage, String status,
                            double ratedCapacityMW, double currentLoadMW, String importanceLevel,
                            int priority, double outageCostPerMWh, String loadType) {
        Load load = new Load();
        load.setDeviceId(deviceId);
        load.setName(name);
        load.setVoltageLevel(voltage);
        load.setStatus(status);
        load.setSubstation("TEST_SUB");
        load.setRatedCapacityMW(ratedCapacityMW);
        load.setCurrentLoadMW(currentLoadMW);
        load.setLoadFactor(currentLoadMW / ratedCapacityMW);
        load.setImportanceLevel(importanceLevel);
        load.setPriority(priority);
        load.setOutageCostPerMWh(outageCostPerMWh);
        load.setLoadType(loadType);
        return load;
    }
}
