# SoopNote

> 본 만큼만 말해요 — SOOP 버추얼 스트리머 시청자 리뷰

## 스택
- Cloudflare Pages + Workers (functions/)
- Supabase PostgreSQL
- Cloudflare R2 (이미지 저장)

## 주요 기능
- SOOP 리캡 share URL로 시청자 인증 (2시간↑)
- 인증된 시청자만 리뷰 작성
- 익명 표시: "N시간 시청자"
- 사진 1~2장 첨부 (webp 포함, 2MB 이하)
- fingerprint 기반 중복 방지

## DB 테이블
- `soop_streamers` : 스트리머 목록
- `soop_notes` : 리뷰 (visitor_fingerprint, watch_seconds, image_urls)

## 인증 플로우
1. SOOP 리캡 share URL 입력
2. 파싱 → 2시간↑ 시청 스트리머 목록 추출
3. 스트리머 선택 → 리뷰 작성
