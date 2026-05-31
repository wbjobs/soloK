CREATE DATABASE IF NOT EXISTS task_scheduler DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE task_scheduler;

CREATE TABLE IF NOT EXISTS workers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    ip VARCHAR(50) DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    last_heartbeat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_worker_name (name),
    KEY idx_last_heartbeat (last_heartbeat),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    task_type VARCHAR(50) NOT NULL,
    payload TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    worker_id BIGINT UNSIGNED DEFAULT NULL,
    retry_count INT NOT NULL DEFAULT 0,
    max_retry INT NOT NULL DEFAULT 3,
    error_message TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    started_at DATETIME DEFAULT NULL,
    finished_at DATETIME DEFAULT NULL,
    KEY idx_task_status (status),
    KEY idx_task_type (task_type),
    KEY idx_worker_id (worker_id),
    KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
