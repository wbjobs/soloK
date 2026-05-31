package com.powergrid.check.repository;

import com.powergrid.check.model.entity.ViolationCase;
import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ViolationCaseRepository extends CrudRepository<ViolationCase, String> {

    List<ViolationCase> findByRuleName(String ruleName);

    List<ViolationCase> findBySeverity(String severity);

    List<ViolationCase> findByDeviceType(String deviceType);

    List<ViolationCase> findByOrderByOccurrenceCountDesc();
}
