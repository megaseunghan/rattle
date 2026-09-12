-- 매장 정보 화면 리디자인: 출퇴근 GPS 허용 반경을 매장마다 설정 가능하게 함
-- (기존엔 lib/services/attendance.ts에 40m로 고정돼 있었음)
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS attendance_radius_m INT NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS attendance_block_outside BOOLEAN NOT NULL DEFAULT true;
