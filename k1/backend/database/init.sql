CREATE DATABASE IF NOT EXISTS parcel_tracking;
USE parcel_tracking;

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'courier') NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parcels (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tracking_number VARCHAR(15) UNIQUE NOT NULL,
  sender_name VARCHAR(100) NOT NULL,
  sender_phone VARCHAR(20) NOT NULL,
  sender_address VARCHAR(255) NOT NULL,
  sender_lat DECIMAL(10, 6),
  sender_lng DECIMAL(10, 6),
  receiver_name VARCHAR(100) NOT NULL,
  receiver_phone VARCHAR(20) NOT NULL,
  receiver_address VARCHAR(255) NOT NULL,
  receiver_lat DECIMAL(10, 6),
  receiver_lng DECIMAL(10, 6),
  weight DECIMAL(8, 2) NOT NULL,
  shipping_method ENUM('air', 'land') NOT NULL,
  status ENUM('created', 'in_transit', 'delivered') DEFAULT 'created',
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tracking_nodes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  parcel_id INT NOT NULL,
  node_type ENUM('transfer_center', 'distribution_center', 'delivery_station') NOT NULL,
  node_name VARCHAR(100) NOT NULL,
  latitude DECIMAL(10, 6) NOT NULL,
  longitude DECIMAL(10, 6) NOT NULL,
  arrived_at TIMESTAMP NULL,
  departed_at TIMESTAMP NULL,
  scanned_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parcel_id) REFERENCES parcels(id),
  FOREIGN KEY (scanned_by) REFERENCES users(id)
);

CREATE INDEX idx_tracking_number ON parcels(tracking_number);
CREATE INDEX idx_parcel_id ON tracking_nodes(parcel_id);

INSERT INTO users (username, password, role, name) VALUES 
('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', '系统管理员'),
('courier1', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'courier', '快递员小王');
