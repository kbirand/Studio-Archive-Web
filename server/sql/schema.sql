-- ============================================
-- Studio Archive Web - MySQL Database Schema
-- ============================================
-- Run this script to create an empty database
-- 
-- Usage:
--   mysql -u your_user -p your_database < schema.sql
-- 
-- Or in MySQL client:
--   source /path/to/schema.sql
-- ============================================

-- Works table: Stores photo collection/project metadata
CREATE TABLE IF NOT EXISTS works (
    id INT AUTO_INCREMENT PRIMARY KEY,
    path VARCHAR(500) NOT NULL,
    name VARCHAR(255) NOT NULL,
    ordered INT DEFAULT 0,
    visible TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_works_ordered (ordered),
    INDEX idx_works_visible (visible)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Files table: Stores individual file metadata within works
CREATE TABLE IF NOT EXISTS files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    workid INT NOT NULL,
    file VARCHAR(500) NOT NULL,
    ordered INT DEFAULT 0,
    visible TINYINT(1) DEFAULT 1,
    INDEX idx_files_workid (workid),
    INDEX idx_files_ordered (ordered),
    FOREIGN KEY (workid) REFERENCES works(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Users table: Stores user accounts and permissions
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255),
    picture TEXT,
    level INT DEFAULT 0,
    approved TINYINT(1) DEFAULT 0,
    preferences TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_email (email),
    INDEX idx_users_approved (approved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User logs table: Stores activity/audit logs
CREATE TABLE IF NOT EXISTS user_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_logs_user_id (user_id),
    INDEX idx_logs_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


