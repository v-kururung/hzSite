-- Hz 사이트 D1 스키마
-- 적용: npx wrangler d1 execute hz --remote --file=./schema.sql

-- 수집된 게시글 (COLLECT_SINCE 이후 글만 쌓임)
CREATE TABLE IF NOT EXISTS posts (
  title_no     INTEGER PRIMARY KEY,   -- SOOP 글 번호
  member_id    TEXT    NOT NULL,      -- SOOP 방송국 아이디
  bbs_no       INTEGER,               -- 게시판 번호
  bbs_name     TEXT,                  -- 게시판 이름
  title        TEXT,
  summary      TEXT,
  thumb        TEXT,
  reg_date     TEXT    NOT NULL,      -- "YYYY-MM-DD HH:MM:SS" (KST)
  read_cnt     INTEGER DEFAULT 0,
  comment_cnt  INTEGER DEFAULT 0,
  like_cnt     INTEGER DEFAULT 0,
  collected_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_reg_date ON posts (reg_date DESC);
CREATE INDEX IF NOT EXISTS idx_posts_member   ON posts (member_id, reg_date DESC);

-- 방송국 메타 캐시 (닉네임·프로필·게시판 목록)
CREATE TABLE IF NOT EXISTS members (
  id            TEXT PRIMARY KEY,
  nick          TEXT,
  profile_image TEXT,
  station_no    INTEGER,
  boards        TEXT,   -- JSON 배열 [{ no, name, wAuth }]
  fan_cnt       INTEGER,
  updated_at    TEXT
);

-- 라운드로빈 수집 커서
CREATE TABLE IF NOT EXISTS scan_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);
