// Hz 사이트 API (Cloudflare Pages Functions)
//
//   GET /api/members            멤버 목록 (설정 파일 그대로)
//   GET /api/live[?refresh=1]   16명 라이브 상태 — Cache API 60초 캐시
//   GET /api/feed?...           누적된 게시글 피드 — D1에서 조회
//   GET /api/health             설정·연결 상태 점검
//
// 바인딩: DB (D1)
// 환경변수(선택): COLLECT_SINCE (기본 2026-09-21), SCAN_INTERVAL_MIN, SCAN_MEMBERS_PER_TICK

import { MEMBERS, findMember } from '../_members.js';
import { fetchStation, offlineFallback, fetchBoardPosts, normalizePost } from '../_soop.js';

const LIVE_CACHE_KEY = 'https://hz-site.internal/cache/live-v1';
const LIVE_TTL_SEC = 60;
const REFRESH_COOLDOWN_MS = 20 * 1000;

const DEFAULT_COLLECT_SINCE = '2026-09-21';
const DEFAULT_SCAN_INTERVAL_MIN = 10;
const DEFAULT_SCAN_MEMBERS_PER_TICK = 2;
const MAX_BOARDS_PER_MEMBER = 10;
const POSTS_PER_BOARD = 10;

export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);
  const route = (params.route || []).join('/');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  try {
    if (route === 'members') return json({ members: MEMBERS });
    if (route === 'live') return await handleLive(context, url);
    if (route === 'feed') return await handleFeed(context, url);
    if (route === 'health') return await handleHealth(context);
    return json({ error: 'not_found', route }, 404);
  } catch (error) {
    return json({ error: 'internal_error', message: String((error && error.message) || error) }, 500);
  }
}

/* ------------------------------------------------------------------ */
/* /api/live                                                           */
/* ------------------------------------------------------------------ */

async function handleLive(context, url) {
  const { waitUntil, env } = context;
  const wantsRefresh = url.searchParams.get('refresh') === '1';
  const cache = caches.default;
  const cacheKey = new Request(LIVE_CACHE_KEY, { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached) {
    const generatedAt = Number(cached.headers.get('x-generated-at') || 0);
    const age = Date.now() - generatedAt;
    const cooling = wantsRefresh && age < REFRESH_COOLDOWN_MS;
    if (!wantsRefresh || cooling) {
      const body = await cached.json();
      return json(
        { ...body, cached: true, ageMs: age, cooldown: cooling },
        200,
        { 'cache-control': `public, max-age=${LIVE_TTL_SEC}` }
      );
    }
  }

  const members = await collectLive();
  const payload = {
    updatedAt: new Date().toISOString(),
    liveCount: members.filter((m) => m.live).length,
    members,
  };

  const response = json(payload, 200, {
    'cache-control': `public, max-age=${LIVE_TTL_SEC}`,
    'x-generated-at': String(Date.now()),
  });
  waitUntil(cache.put(cacheKey, response.clone()));
  if (env && env.DB) waitUntil(saveMemberMeta(env.DB, members));

  return response;
}

async function collectLive() {
  const results = await Promise.all(
    MEMBERS.map(async (member) => {
      try {
        return await fetchStation(member);
      } catch (error) {
        return offlineFallback(member, error);
      }
    })
  );

  // 방송 중인 멤버를 앞으로, 그 다음은 members.js 에 적힌 순서 유지
  const order = new Map(MEMBERS.map((m, index) => [m.id, index]));
  return results.sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
}

async function saveMemberMeta(db, members) {
  const now = new Date().toISOString();
  const statements = members
    .filter((m) => !m.error)
    .map((m) =>
      db
        .prepare(
          `INSERT INTO members (id, nick, profile_image, station_no, boards, fan_cnt, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(id) DO UPDATE SET
             nick = excluded.nick,
             profile_image = excluded.profile_image,
             station_no = excluded.station_no,
             boards = excluded.boards,
             fan_cnt = excluded.fan_cnt,
             updated_at = excluded.updated_at`
        )
        .bind(m.id, m.nick, m.profile, m.stationNo, JSON.stringify(m.boards || []), m.fanCnt, now)
    );

  if (!statements.length) return;
  try {
    await db.batch(statements);
  } catch (error) {
    console.error('saveMemberMeta failed', error);
  }
}

/* ------------------------------------------------------------------ */
/* /api/feed                                                           */
/* ------------------------------------------------------------------ */

async function handleFeed(context, url) {
  const { env, waitUntil } = context;
  if (!env || !env.DB) {
    return json({ error: 'db_not_bound', message: 'D1 바인딩 DB 가 없습니다.' }, 500);
  }

  const db = env.DB;
  const memberFilter = url.searchParams.get('member');
  const limit = clamp(Number(url.searchParams.get('limit') || 60), 1, 200);
  const wantsRefresh = url.searchParams.get('refresh') === '1';

  // 응답을 막지 않고 뒤에서 라운드로빈 수집
  waitUntil(runScan(env, wantsRefresh));

  const since = collectSince(env);
  let rows;
  if (memberFilter) {
    rows = await db
      .prepare(
        `SELECT * FROM posts
         WHERE member_id = ?1 AND reg_date >= ?2
         ORDER BY reg_date DESC LIMIT ?3`
      )
      .bind(memberFilter, since, limit)
      .all();
  } else {
    rows = await db
      .prepare(
        `SELECT * FROM posts
         WHERE reg_date >= ?1
         ORDER BY reg_date DESC LIMIT ?2`
      )
      .bind(since, limit)
      .all();
  }

  const state = await readScanState(db);
  return json({
    since,
    updatedAt: state.lastScanAt,
    scannedMembers: state.scannedCount,
    posts: (rows.results || []).map(rowToPost),
  });
}

function rowToPost(row) {
  const member = findMember(row.member_id);
  return {
    titleNo: row.title_no,
    memberId: row.member_id,
    memberName: (member && member.name) || row.member_id,
    bbsName: row.bbs_name || '',
    title: row.title || '',
    summary: row.summary || '',
    thumb: row.thumb || null,
    regDate: row.reg_date,
    readCnt: row.read_cnt || 0,
    commentCnt: row.comment_cnt || 0,
    likeCnt: row.like_cnt || 0,
    url: `https://www.sooplive.com/station/${row.member_id}/board/${row.title_no}`,
  };
}

/* ------------------------------------------------------------------ */
/* 게시글 수집 (라운드로빈)                                             */
/* ------------------------------------------------------------------ */

async function runScan(env, force) {
  const db = env.DB;
  const intervalMs = numberFromEnv(env, 'SCAN_INTERVAL_MIN', DEFAULT_SCAN_INTERVAL_MIN) * 60 * 1000;
  const perTick = numberFromEnv(env, 'SCAN_MEMBERS_PER_TICK', DEFAULT_SCAN_MEMBERS_PER_TICK);

  try {
    const state = await readScanState(db);
    const lastMs = state.lastScanAt ? Date.parse(state.lastScanAt) : 0;
    if (!force && Date.now() - lastMs < intervalMs) return;

    const startIndex = state.cursor % MEMBERS.length;
    const targets = [];
    for (let i = 0; i < Math.min(perTick, MEMBERS.length); i += 1) {
      targets.push(MEMBERS[(startIndex + i) % MEMBERS.length]);
    }

    for (const member of targets) {
      await scanMember(env, member);
    }

    await writeScanState(db, {
      cursor: (startIndex + targets.length) % MEMBERS.length,
      lastScanAt: new Date().toISOString(),
      scannedCount: (state.scannedCount || 0) + targets.length,
    });
  } catch (error) {
    console.error('runScan failed', error);
  }
}

async function scanMember(env, member) {
  const db = env.DB;
  const since = collectSince(env);

  let boards = await readCachedBoards(db, member.id);
  if (!boards.length) {
    try {
      const station = await fetchStation(member);
      boards = station.boards || [];
      await saveMemberMeta(db, [station]);
    } catch (error) {
      console.error(`station fetch failed for ${member.id}`, error);
      return;
    }
  }

  const targetBoards = boards.slice(0, MAX_BOARDS_PER_MEMBER);
  const collected = [];

  for (const board of targetBoards) {
    try {
      const posts = await fetchBoardPosts(member.id, board.no, POSTS_PER_BOARD);
      for (const post of posts) {
        // 스트리머 본인이 쓴 글만, 그리고 수집 시작일 이후 글만
        if (post.user_id !== member.id) continue;
        if (!post.reg_date || post.reg_date < since) continue;
        collected.push(normalizePost(member.id, post));
      }
    } catch (error) {
      console.error(`board fetch failed ${member.id}/${board.no}`, error);
    }
  }

  if (!collected.length) return;

  const statements = collected.map((post) =>
    db
      .prepare(
        `INSERT INTO posts
           (title_no, member_id, bbs_no, bbs_name, title, summary, thumb,
            reg_date, read_cnt, comment_cnt, like_cnt, collected_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(title_no) DO UPDATE SET
           title = excluded.title,
           summary = excluded.summary,
           thumb = COALESCE(excluded.thumb, posts.thumb),
           bbs_name = excluded.bbs_name,
           read_cnt = excluded.read_cnt,
           comment_cnt = excluded.comment_cnt,
           like_cnt = excluded.like_cnt`
      )
      .bind(
        post.titleNo,
        post.memberId,
        post.bbsNo,
        post.bbsName,
        post.title,
        post.summary,
        post.thumb,
        post.regDate,
        post.readCnt,
        post.commentCnt,
        post.likeCnt,
        new Date().toISOString()
      )
  );

  try {
    await db.batch(statements);
  } catch (error) {
    console.error(`post upsert failed for ${member.id}`, error);
  }
}

async function readCachedBoards(db, memberId) {
  try {
    const row = await db.prepare('SELECT boards FROM members WHERE id = ?1').bind(memberId).first();
    if (!row || !row.boards) return [];
    const parsed = JSON.parse(row.boards);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function readScanState(db) {
  const fallback = { cursor: 0, lastScanAt: null, scannedCount: 0 };
  try {
    const row = await db.prepare("SELECT value FROM scan_state WHERE key = 'feed'").first();
    if (!row || !row.value) return fallback;
    return { ...fallback, ...JSON.parse(row.value) };
  } catch (error) {
    return fallback;
  }
}

async function writeScanState(db, state) {
  await db
    .prepare(
      `INSERT INTO scan_state (key, value) VALUES ('feed', ?1)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .bind(JSON.stringify(state))
    .run();
}

/* ------------------------------------------------------------------ */
/* /api/health                                                         */
/* ------------------------------------------------------------------ */

async function handleHealth(context) {
  const { env } = context;
  const result = {
    memberCount: MEMBERS.length,
    collectSince: collectSince(env),
    db: 'unbound',
    postCount: null,
    lastScanAt: null,
  };

  if (env && env.DB) {
    try {
      const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM posts').first();
      const state = await readScanState(env.DB);
      result.db = 'ok';
      result.postCount = row ? row.c : 0;
      result.lastScanAt = state.lastScanAt;
    } catch (error) {
      result.db = 'error: ' + String((error && error.message) || error);
    }
  }

  return json(result);
}

/* ------------------------------------------------------------------ */
/* 유틸                                                                */
/* ------------------------------------------------------------------ */

function collectSince(env) {
  return (env && env.COLLECT_SINCE) || DEFAULT_COLLECT_SINCE;
}

function numberFromEnv(env, key, fallback) {
  const raw = env && env[key];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}
