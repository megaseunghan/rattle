import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { AttendanceHmacSha256 } from './attendanceQr';

/** 주입형 QR 생성기에 연결하는 기본 어댑터. Node/네이티브 API 없이 raw 32바이트를 반환한다. */
export const defaultAttendanceHmacSha256: AttendanceHmacSha256 = (key, message) => hmac(sha256, key, message);
