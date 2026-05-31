package com.loganomaly.repository;

import com.loganomaly.entity.AlertHistory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface AlertHistoryRepository extends JpaRepository<AlertHistory, String> {

    Page<AlertHistory> findByIpOrderByCreatedAtDesc(String ip, Pageable pageable);

    Page<AlertHistory> findByAlertTypeOrderByCreatedAtDesc(String alertType, Pageable pageable);

    Page<AlertHistory> findAllByOrderByCreatedAtDesc(Pageable pageable);

    List<AlertHistory> findByCreatedAtBetweenOrderByCreatedAtDesc(Instant start, Instant end);

    @Query("SELECT a FROM AlertHistory a WHERE a.ip = :ip AND a.createdAt BETWEEN :start AND :end ORDER BY a.createdAt DESC")
    List<AlertHistory> findByIpAndTimeRange(@Param("ip") String ip,
                                             @Param("start") Instant start,
                                             @Param("end") Instant end);

    long countByAlertType(String alertType);

    long countByCreatedAtAfter(Instant since);
}
