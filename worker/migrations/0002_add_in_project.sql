-- ============================================================
-- Migration 0002: Add in_project to legacy_records and shops
-- Default is NULL (indicates not yet specified / ยังไม่ได้เลือก)
-- 1 = อยู่ในโครงการ (Premium), 0 = ไม่อยู่ในโครงการ
-- ============================================================

ALTER TABLE legacy_records ADD COLUMN in_project INTEGER DEFAULT NULL;
ALTER TABLE shops ADD COLUMN in_project INTEGER DEFAULT NULL;
