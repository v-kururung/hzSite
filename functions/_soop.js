// SOOP 방송국 API 래퍼
//
// 확인된 엔드포인트 (2026-09-21 기준, 비공식 내부 API)
//   GET https://chapi.sooplive.co.kr/api/{id}/station
//     → { profile_image, station: { user_nick, station_no, broad_start, menus[], upd{} }, broad: null|{} }
//       broad 가 null 이면 오프라인, 객체면 방송 중
//       menus[] 에 게시판 목록이 들어있음 (bbs_no / name / display_type / w_auth_no)
//         display_type 104 = 일반 게시판, 106 = 구분선, 107 = 그룹 헤더, 108/109 = VOD
//   GET https://chapi.sooplive.co.kr/api/{id}/board/{bbs_no}?page=1&per_page=N&field=title&orderby=reg_date
//     → { data: [ { title_no, title_name, user_id, reg_date, photos[], count{}, content{summary}, display{bbs_name} } ] }
//   글 주소: https://www.sooplive.com/station/{id}/board/{title_no}

export const CHAPI = 'https://chapi.sooplive.co.kr/api';
export const STATION_BASE = 'https://www.sooplive.com/station';
export const LIVE_THUMB_BASE = 'https://liveimg.sooplive.co.kr/m';

const REQUEST_TIMEOUT_MS = 8000;

const COMMON_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'ko-KR,ko;q=0.9',
  referer: 'https://www.sooplive.com/',
  origin: 'https://www.sooplive.com',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};

/** //profile.img... 같은 프로토콜 상대 주소를 https 절대 주소로 */
export function toAbsoluteUrl(value) {
  if (!value) return null;
  if (value.startsWith('//')) return 'https:' + value;
  if (value.startsWith('http')) return value;
  return null;
}

async function fetchJson(url, edgeCacheTtl = 0) {
  const init = { headers: COMMON_HEADERS };
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  }
  if (edgeCacheTtl > 0) init.cf = { cacheTtl: edgeCacheTtl, cacheEverything: true };

  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`SOOP ${res.status} ${url}`);
  return await res.json();
}

/** 방송국 정보 + 라이브 여부 + 게시판 목록 */
export async function fetchStation(member) {
  const raw = await fetchJson(`${CHAPI}/${member.id}/station`, 30);
  const st = raw.station || {};
  const display = st.display || {};
  const broad = raw.broad || null;
  const live = !!broad;

  const boards = (st.menus || [])
    .filter((menu) => menu.display_type === 104 && menu.name)
    .map((menu) => ({
      no: menu.bbs_no,
      name: String(menu.name).trim(),
      wAuth: menu.w_auth_no,
    }));

  return {
    id: member.id,
    name: member.name || st.user_nick || member.id,
    nick: st.user_nick || member.name || member.id,
    role: member.role || '',
    links: member.links || {},
    profile: toAbsoluteUrl(raw.profile_image),
    profileText: display.profile_text || '',
    stationNo: st.station_no || null,
    stationUrl: `${STATION_BASE}/${member.id}`,
    fanCnt: st.upd && typeof st.upd.fan_cnt === 'number' ? st.upd.fan_cnt : null,
    lastBroadStart: st.broad_start || null,
    live,
    broadNo: live ? broad.broad_no || null : null,
    broadTitle: live ? broad.broad_title || '' : null,
    broadStart: live ? broad.broad_start || st.broad_start || null : null,
    viewers: live ? pickViewerCount(broad) : null,
    adult: live ? broad.broad_grade === 19 : false,
    thumb: live && broad.broad_no ? `${LIVE_THUMB_BASE}/${broad.broad_no}` : null,
    liveUrl: live && broad.broad_no ? `https://play.sooplive.co.kr/${member.id}/${broad.broad_no}` : null,
    boards,
    error: null,
  };
}

function pickViewerCount(broad) {
  const candidates = [broad.current_sum_viewer, broad.total_view_cnt, broad.view_cnt];
  for (const value of candidates) {
    if (typeof value === 'number') return value;
  }
  return null;
}

/** 실패해도 카드 한 장은 그리도록, 오프라인 취급 + error 를 달아서 반환 */
export function offlineFallback(member, error) {
  return {
    id: member.id,
    name: member.name || member.id,
    nick: member.name || member.id,
    role: member.role || '',
    links: member.links || {},
    profile: null,
    profileText: '',
    stationNo: null,
    stationUrl: `${STATION_BASE}/${member.id}`,
    fanCnt: null,
    lastBroadStart: null,
    live: false,
    broadNo: null,
    broadTitle: null,
    broadStart: null,
    viewers: null,
    adult: false,
    thumb: null,
    liveUrl: null,
    boards: [],
    error: String((error && error.message) || error),
  };
}

/** 게시판 한 개의 최근 글 목록 */
export async function fetchBoardPosts(memberId, bbsNo, perPage = 10) {
  const url =
    `${CHAPI}/${memberId}/board/${bbsNo}` +
    `?page=1&per_page=${perPage}&field=title&orderby=reg_date`;
  const raw = await fetchJson(url, 0);
  return Array.isArray(raw.data) ? raw.data : [];
}

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const SRC_RE = /\bsrc\s*=\s*["']([^"']+)["']/i;
const CLASS_RE = /\bclass\s*=\s*["']([^"']*)["']/i;

/** 본문 HTML에서 이모티콘이 아닌 첫 이미지를 썸네일 후보로 */
export function extractThumb(post) {
  const photos = post.photos;
  if (Array.isArray(photos) && photos.length) {
    const first = photos[0];
    const candidate =
      toAbsoluteUrl(first.url) ||
      toAbsoluteUrl(first.image) ||
      toAbsoluteUrl(first.thumbnail) ||
      toAbsoluteUrl(first.file_url);
    if (candidate) return candidate;
  }

  const html = (post.content && post.content.content) || '';
  const tags = html.match(IMG_TAG_RE) || [];
  for (const tag of tags) {
    const classMatch = tag.match(CLASS_RE);
    const className = classMatch ? classMatch[1] : '';
    if (/\b(emtn|ogq_item)\b/.test(className)) continue;
    if (/data-emoji\s*=\s*["']true["']/i.test(tag)) continue;
    const srcMatch = tag.match(SRC_RE);
    const src = srcMatch ? toAbsoluteUrl(srcMatch[1]) : null;
    if (src) return src;
  }
  return null;
}

/** 목록 응답 항목 → D1에 넣을 형태 */
export function normalizePost(memberId, post) {
  const counts = post.count || {};
  const content = post.content || {};
  const summaryRaw = content.summary || content.text_content || '';
  const summary = String(summaryRaw)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

  return {
    titleNo: post.title_no,
    memberId,
    bbsNo: post.bbs_no || null,
    bbsName: (post.display && post.display.bbs_name) || '',
    title: post.title_name || '(제목 없음)',
    summary,
    thumb: extractThumb(post),
    regDate: post.reg_date || '',
    readCnt: counts.read_cnt || 0,
    commentCnt: counts.comment_cnt || 0,
    likeCnt: counts.like_cnt || 0,
    url: `${STATION_BASE}/${memberId}/board/${post.title_no}`,
  };
}
