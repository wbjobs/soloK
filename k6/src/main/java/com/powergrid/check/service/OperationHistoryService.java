package com.powergrid.check.service;

import com.powergrid.check.model.entity.OperationHistory;
import com.powergrid.check.model.entity.ViolationCase;
import com.powergrid.check.repository.OperationHistoryRepository;
import com.powergrid.check.repository.ViolationCaseRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class OperationHistoryService {

    private final OperationHistoryRepository operationHistoryRepository;
    private final ViolationCaseRepository violationCaseRepository;

    public List<OperationHistory> getHistoryByOrderId(String orderId) {
        return operationHistoryRepository.findByOrderIdOrderByOperateTimeDesc(orderId);
    }

    public List<OperationHistory> getHistoryByDeviceId(String deviceId) {
        return operationHistoryRepository.findByDeviceIdOrderByOperateTimeDesc(deviceId);
    }

    public List<OperationHistory> getHistoryByOperator(String operator) {
        return operationHistoryRepository.findByOperatorOrderByOperateTimeDesc(operator);
    }

    public List<OperationHistory> getHistoryByTimeRange(LocalDateTime startTime, LocalDateTime endTime) {
        return operationHistoryRepository.findByOperateTimeBetweenOrderByOperateTimeDesc(startTime, endTime);
    }

    public List<OperationHistory> getViolationHistory() {
        return operationHistoryRepository.findByHasViolationTrueOrderByOperateTimeDesc();
    }

    public OperationHistory saveHistory(OperationHistory history) {
        return operationHistoryRepository.save(history);
    }

    public Optional<OperationHistory> getHistoryById(String id) {
        return operationHistoryRepository.findById(id);
    }

    public List<ViolationCase> getAllViolationCases() {
        return violationCaseRepository.findByOrderByOccurrenceCountDesc();
    }

    public List<ViolationCase> getViolationCasesByRule(String ruleName) {
        return violationCaseRepository.findByRuleName(ruleName);
    }

    public List<ViolationCase> getViolationCasesBySeverity(String severity) {
        return violationCaseRepository.findBySeverity(severity);
    }

    public List<ViolationCase> getViolationCasesByDeviceType(String deviceType) {
        return violationCaseRepository.findByDeviceType(deviceType);
    }

    public Optional<ViolationCase> getViolationCaseById(String id) {
        return violationCaseRepository.findById(id);
    }

    public ViolationCase saveViolationCase(ViolationCase violationCase) {
        if (violationCase.getCreateTime() == null) {
            violationCase.setCreateTime(LocalDateTime.now());
        }
        violationCase.setUpdateTime(LocalDateTime.now());
        if (violationCase.getOccurrenceCount() == null) {
            violationCase.setOccurrenceCount(1);
        }
        return violationCaseRepository.save(violationCase);
    }

    public void incrementCaseOccurrence(String caseId) {
        violationCaseRepository.findById(caseId).ifPresent(c -> {
            c.setOccurrenceCount(c.getOccurrenceCount() + 1);
            c.setUpdateTime(LocalDateTime.now());
            violationCaseRepository.save(c);
        });
    }

    public void initializeViolationCases() {
        if (violationCaseRepository.count() > 0) {
            log.info("违规案例库已存在数据，跳过初始化");
            return;
        }

        log.info("开始初始化违规案例库...");

        ViolationCase case1 = new ViolationCase();
        case1.setCaseId("CASE-001");
        case1.setRuleName("防止带负荷拉合隔离开关");
        case1.setSeverity("CRITICAL");
        case1.setTitle("带负荷拉隔离开关造成弧光短路");
        case1.setDescription("某变电站运行人员在未断开断路器的情况下，直接拉开隔离开关，造成带负荷拉刀闸，产生强烈弧光，导致相间短路，断路器跳闸。");
        case1.setDeviceType("Disconnector");
        case1.setInvolvedDevices(new ArrayList<>(Arrays.asList("DS-101", "CB-101")));
        case1.setRiskAnalysis("带负荷拉合隔离开关会产生强烈电弧，可能造成设备损坏、人员伤亡、大面积停电等严重后果。");
        case1.setCorrectOperation("操作隔离开关前必须确认关联断路器已处于分闸位置，回路中无负荷电流。");
        case1.setPreventiveMeasures("1. 严格执行操作票制度，操作前核对设备编号和状态；2. 操作断路器后确认其确已断开；3. 安装电气闭锁装置，防止误操作。");
        case1.setOccurrenceCount(5);
        saveViolationCase(case1);

        ViolationCase case2 = new ViolationCase();
        case2.setCaseId("CASE-002");
        case2.setRuleName("防止带地线合闸");
        case2.setSeverity("CRITICAL");
        case2.setTitle("带接地线合闸造成三相短路");
        case2.setDescription("某变电站检修工作结束后，运行人员未拆除检修时挂的接地线，就进行合闸送电操作，造成带地线合闸，导致保护动作跳闸。");
        case2.setDeviceType("Breaker");
        case2.setInvolvedDevices(new ArrayList<>(Arrays.asList("CB-201", "GND-201")));
        case2.setRiskAnalysis("带地线合闸会造成三相短路，产生巨大的短路电流，对设备造成严重损坏，甚至引起变电站停电事故。");
        case2.setCorrectOperation("合闸送电前必须全面检查所有接地线、接地刀闸已全部拆除或断开，并进行现场确认。");
        case2.setPreventiveMeasures("1. 建立接地线登记制度，装设和拆除都要有记录；2. 送电前进行现场检查，确认安全措施已全部拆除；3. 加装地线闭锁装置。");
        case2.setOccurrenceCount(8);
        saveViolationCase(case2);

        ViolationCase case3 = new ViolationCase();
        case3.setCaseId("CASE-003");
        case3.setRuleName("防止带电挂地线");
        case3.setSeverity("CRITICAL");
        case3.setTitle("带电挂接地线造成人身伤亡");
        case3.setDescription("某检修人员在未验电的情况下，擅自攀登设备构架挂接地线，由于设备仍带电，造成触电伤亡事故。");
        case3.setDeviceType("GroundSwitch");
        case3.setInvolvedDevices(new ArrayList<>(Arrays.asList("GND-301")));
        case3.setRiskAnalysis("带电挂地线会直接造成人身触电伤亡和设备短路事故，是非常严重的恶性误操作。");
        case3.setCorrectOperation("挂地线前必须先验电，确认设备确无电压后方可进行。验电时要使用合格的验电器。");
        case3.setPreventiveMeasures("1. 严格执行验电、接地操作规范；2. 正确使用安全工器具；3. 设专人监护；4. 安装防误闭锁装置。");
        case3.setOccurrenceCount(3);
        saveViolationCase(case3);

        ViolationCase case4 = new ViolationCase();
        case4.setCaseId("CASE-004");
        case4.setRuleName("防止误入带电间隔");
        case4.setSeverity("CRITICAL");
        case4.setTitle("误入带电间隔造成设备短路");
        case4.setDescription("某运行人员走错间隔，误将带电设备当作停电设备进行检修操作，造成人身触电和设备短路事故。");
        case4.setDeviceType("Interval");
        case4.setInvolvedDevices(new ArrayList<>(Arrays.asList("INT-401")));
        case4.setRiskAnalysis("误入带电间隔会造成人身触电伤亡，同时可能引起设备短路，导致停电事故扩大。");
        case4.setCorrectOperation("操作前必须核对设备名称、编号、间隔，确认无误后方可进入。");
        case4.setPreventiveMeasures("1. 完善设备标识和间隔命名；2. 操作前执行五核对制度；3. 加装带电显示装置和闭锁装置。");
        case4.setOccurrenceCount(4);
        saveViolationCase(case4);

        ViolationCase case5 = new ViolationCase();
        case5.setCaseId("CASE-005");
        case5.setRuleName("防止误分合断路器");
        case5.setSeverity("HIGH");
        case5.setTitle("误分断路器造成重要负荷停电");
        case5.setDescription("某调度员下达错误操作指令，运行人员误操作断开了正在运行的重要负荷断路器，造成重要用户停电。");
        case5.setDeviceType("Breaker");
        case5.setInvolvedDevices(new ArrayList<>(Arrays.asList("CB-501")));
        case5.setRiskAnalysis("误分合断路器可能造成重要负荷停电，影响生产和生活用电，严重时可能造成社会影响。");
        case5.setCorrectOperation("操作前必须仔细核对操作票内容和设备编号，确认无误后执行复诵制度。");
        case5.setPreventiveMeasures("1. 严格执行操作票和监护制度；2. 操作时执行唱票复诵；3. 重要设备加装操作确认装置。");
        case5.setOccurrenceCount(6);
        saveViolationCase(case5);

        ViolationCase case6 = new ViolationCase();
        case6.setCaseId("CASE-006");
        case6.setRuleName("操作顺序约束");
        case6.setSeverity("HIGH");
        case6.setTitle("操作顺序错误导致设备损坏");
        case6.setDescription("某变电站进行倒闸操作时，违反操作顺序，先合线路侧刀闸后合母线侧刀闸，造成设备损坏。");
        case6.setDeviceType("Disconnector");
        case6.setInvolvedDevices(new ArrayList<>(Arrays.asList("DS-BUS-601", "DS-LINE-601")));
        case6.setRiskAnalysis("操作顺序错误会导致设备在非正常工况下运行，可能造成设备损坏和停电事故。");
        case6.setCorrectOperation("合闸时应先合母线侧刀闸，后合线路侧刀闸；分闸时应先分线路侧刀闸，后分母线侧刀闸。");
        case6.setPreventiveMeasures("1. 制定详细的操作顺序规范并严格执行；2. 通过技术手段实现操作顺序闭锁。");
        case6.setOccurrenceCount(2);
        saveViolationCase(case6);

        log.info("违规案例库初始化完成，共添加{}个案例", 6);
    }
}
