package com.powergrid.check.repository;

import com.powergrid.check.model.entity.OperationHistory;
import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface OperationHistoryRepository extends CrudRepository<OperationHistory, String> {

    List<OperationHistory> findByOrderIdOrderByOperateTimeDesc(String orderId);

    List<OperationHistory> findByDeviceIdOrderByOperateTimeDesc(String deviceId);

    List<OperationHistory> findByOperatorOrderByOperateTimeDesc(String operator);

    List<OperationHistory> findByOperateTimeBetweenOrderByOperateTimeDesc(LocalDateTime start, LocalDateTime end);

    List<OperationHistory> findByHasViolationTrueOrderByOperateTimeDesc();
}
