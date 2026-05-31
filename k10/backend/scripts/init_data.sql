-- 初始化默认用户
-- 密码: 123456 (SHA256: 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92)

INSERT INTO users (id, username, password, role, created_at) VALUES
('admin-001', 'admin', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'admin', NOW()),
('engineer-001', 'engineer', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'engineer', NOW()),
('maintainer-001', 'maintainer', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'maintainer', NOW()),
('viewer-001', 'viewer', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'viewer', NOW())
ON CONFLICT (username) DO NOTHING;

-- 初始化默认设备
INSERT INTO devices (id, name, type, status, position_x, position_y, position_z,
    rotation_x, rotation_y, rotation_z, created_at, updated_at) VALUES
('arm-001', '机械臂A1', 'robotic_arm', 'offline', -2.0, 0.0, 0.0, 0, 0, 0, NOW(), NOW()),
('arm-002', '机械臂A2', 'robotic_arm', 'offline', 0.0, 0.0, 0.0, 0, 0, 0, NOW(), NOW()),
('conveyor-001', '传送带C1', 'conveyor_belt', 'offline', 2.5, 0.0, 0.0, 0, 0, 0, NOW(), NOW()),
('vision-001', '视觉检测仪V1', 'vision_inspector', 'offline', 2.5, 0.0, 1.5, 0, 0, 0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 初始化虚拟限位
INSERT INTO virtual_limits (id, device_id, x_min, x_max, y_min, y_max, z_min, z_max,
    color, opacity, is_active, created_by, created_at, updated_at) VALUES
('limit-arm-001', 'arm-001', -3.0, -1.0, 0.0, 2.5, -1.0, 1.0, '#00ff00', 0.2, TRUE, 'admin-001', NOW(), NOW()),
('limit-arm-002', 'arm-002', -1.0, 1.0, 0.0, 2.5, -1.0, 1.0, '#00ff00', 0.2, TRUE, 'admin-001', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
