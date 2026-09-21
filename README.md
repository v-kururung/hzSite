# Hz ENTERTAINMENT 사이트

SOOP 방송국 API에서 Hz 멤버 16명의 라이브 상태와 게시글을 모아 보여주는 메인 페이지.
Cloudflare Pages + Pages Functions + D1로 동작한다.

리포지토리: https://github.com/v-kururung/hzSite

## 구조

```
functions/
  _members.js          멤버 목록 (단일 소스 — 프론트·API 공용)
  _soop.js             SOOP API 래퍼 + 응답 파서
  api/[[route]].js     /api/members, /api/live, /api/feed, /api/health
public/
  index.html
  css/style.css
  js/app.js
  assets/logo.png
schema.sql             D1 테이블
```

## 동작 방식

**라이브 상태** — `/api/live`
방문 시 16명 방송국 API를 병렬 호출하고 Cache API에 60초 저장한다. 별도 수집기(Cron)는 없다.
`?refresh=1`로 즉시 재조회할 수 있고 20초 쿨다운이 걸린다.

**게시글** — `/api/feed`
D1에 쌓아둔 글을 바로 읽어 응답하고, 응답을 보낸 뒤 `waitUntil`로 다음 멤버를 수집한다.
한 번에 2명씩 라운드로빈으로 돌기 때문에 방문자는 기다리지 않는다.
글은 **`COLLECT_SINCE`(기본 2026-09-21) 이후 작성분만** 저장된다.

**"스트리머가 쓴 글"만 고르는 방법**
방송국 API의 `station.menus[]`에 게시판 목록이 들어있어서 게시판 번호를 하드코딩할 필요가 없다.
`display_type === 104`인 게시판을 최대 10개까지 훑고, 각 글의 `user_id`가 방송국 주인과
같은 것만 저장한다. 시청자 글은 자동으로 걸러진다.

## 배포

### 1. D1 만들기

```bash
npx wrangler d1 create hz
npx wrangler d1 execute hz --remote --file=./schema.sql
```

### 2. Pages 프로젝트 연결

Cloudflare 대시보드 → Workers & Pages → Create → Pages → Connect to Git →
`v-kururung/hzSite` 선택 후:

| 항목 | 값 |
|---|---|
| Framework preset | None |
| Build command | (비움) |
| Build output directory | `public` |
| Root directory | `/` |

`functions/` 디렉터리는 Pages가 자동으로 인식한다.

### 3. 바인딩

Pages 프로젝트 → Settings → Functions → **D1 database bindings**

| Variable name | D1 database |
|---|---|
| `DB` | `hz` |

Production과 Preview 양쪽에 모두 걸어야 프리뷰 배포에서도 피드가 동작한다.

### 4. 환경변수 (선택)

Settings → Environment variables

| 이름 | 기본값 | 설명 |
|---|---|---|
| `COLLECT_SINCE` | `2026-09-21` | 이 날짜 이후 글만 수집 |
| `SCAN_INTERVAL_MIN` | `10` | 수집 최소 간격(분) |
| `SCAN_MEMBERS_PER_TICK` | `2` | 한 번에 훑을 멤버 수 |

## 로컬 실행

```bash
npx wrangler pages dev public --d1 DB=hz
```

첫 실행 시 로컬 D1에도 스키마를 넣어야 한다.

```bash
npx wrangler d1 execute hz --local --file=./schema.sql
```

## 확인

- `/api/health` — 멤버 수, 수집 시작일, D1 연결, 저장된 글 수, 마지막 수집 시각
- `/api/live` — 라이브 상태 원본 JSON
- `/api/feed?member=kururung` — 특정 멤버 글만

## 멤버 추가·수정

`functions/_members.js`의 `MEMBERS` 배열만 고치면 프론트·API가 같이 반영된다.
`id`는 방송국 주소(`https://www.sooplive.com/station/{id}`)의 마지막 조각이다.

## 참고 — 사용 중인 SOOP 엔드포인트

공식 문서가 없는 내부 API라 응답이 바뀔 수 있다. 바뀌면 `functions/_soop.js`만 고치면 된다.

| 용도 | 엔드포인트 |
|---|---|
| 방송국 정보·라이브 여부·게시판 목록 | `GET https://chapi.sooplive.co.kr/api/{id}/station` |
| 게시판 글 목록 | `GET https://chapi.sooplive.co.kr/api/{id}/board/{bbs_no}?page=1&per_page=10&field=title&orderby=reg_date` |
| 글 주소 | `https://www.sooplive.com/station/{id}/board/{title_no}` |
| 라이브 썸네일 | `https://liveimg.sooplive.co.kr/m/{broad_no}` |

`station` 응답의 `broad`가 `null`이면 오프라인, 객체면 방송 중이다.
