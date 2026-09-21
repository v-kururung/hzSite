/* Hz ENTERTAINMENT — 메인 페이지 스크립트 */

(function () {
  'use strict';

  var LIVE_POLL_MS = 60 * 1000;
  var REFRESH_COOLDOWN_MS = 20 * 1000;

  var state = {
    members: [],
    live: [],
    posts: [],
    activeFilter: 'all',
    lastManualRefresh: 0,
  };

  var el = {
    liveList: document.getElementById('live-list'),
    liveEmpty: document.getElementById('live-empty'),
    liveStatus: document.getElementById('live-status'),
    liveRefresh: document.getElementById('live-refresh'),
    artistGrid: document.getElementById('artist-grid'),
    artistCount: document.getElementById('artist-count'),
    feedFilters: document.getElementById('feed-filters'),
    feedList: document.getElementById('feed-list'),
    feedEmpty: document.getElementById('feed-empty'),
    feedStatus: document.getElementById('feed-status'),
  };

  /* ---------------------------------------------------------------- */
  /* 유틸                                                              */
  /* ---------------------------------------------------------------- */

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getJson(url) {
    return fetch(url, { headers: { accept: 'application/json' } }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  /** "2026-09-20 15:23:04" (KST) → Date */
  function parseKst(value) {
    if (!value) return null;
    var match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!match) {
      var fallback = new Date(value);
      return isNaN(fallback.getTime()) ? null : fallback;
    }
    return new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]) - 9,
        Number(match[5]),
        Number(match[6] || 0)
      )
    );
  }

  function timeAgo(value) {
    var date = parseKst(value);
    if (!date) return '';
    var diff = Date.now() - date.getTime();
    if (diff < 0) diff = 0;

    var minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '방금';
    if (minutes < 60) return minutes + '분 전';

    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + '시간 전';

    var days = Math.floor(hours / 24);
    if (days < 7) return days + '일 전';

    return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  }

  function elapsedSince(value) {
    var date = parseKst(value);
    if (!date) return '';
    var minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (minutes < 0) minutes = 0;
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    return hours > 0 ? hours + '시간 ' + rest + '분째' : rest + '분째';
  }

  function formatCount(value) {
    if (typeof value !== 'number') return null;
    return value.toLocaleString('ko-KR');
  }

  /* ---------------------------------------------------------------- */
  /* LIVE                                                              */
  /* ---------------------------------------------------------------- */

  function renderLive() {
    var liveMembers = state.live.filter(function (m) { return m.live; });

    if (!liveMembers.length) {
      el.liveList.innerHTML = '';
      el.liveEmpty.hidden = false;
      return;
    }

    el.liveEmpty.hidden = true;
    el.liveList.innerHTML = liveMembers
      .map(function (m) {
        var viewers = formatCount(m.viewers);
        var sub = [];
        if (viewers) sub.push('시청자 ' + viewers + '명');
        if (m.broadStart) sub.push(elapsedSince(m.broadStart));

        var thumb = m.thumb
          ? '<img src="' + escapeHtml(m.thumb) + '" alt="" loading="lazy" ' +
            'onerror="this.style.display=&quot;none&quot;">'
          : '';

        var avatar = m.profile
          ? '<img src="' + escapeHtml(m.profile) + '" alt="" loading="lazy">'
          : '';

        return (
          '<a class="live-card" href="' + escapeHtml(m.liveUrl || m.stationUrl) + '" ' +
          'target="_blank" rel="noopener">' +
            '<div class="live-thumb">' + thumb +
              '<span class="live-badge"><span class="live-dot"></span>LIVE</span>' +
            '</div>' +
            '<div class="live-body">' +
              '<div class="live-name">' + avatar + '<span>' + escapeHtml(m.name) + '</span></div>' +
              '<p class="live-title">' + escapeHtml(m.broadTitle || '방송 중') + '</p>' +
              '<div class="live-sub">' + escapeHtml(sub.join(' · ')) + '</div>' +
            '</div>' +
          '</a>'
        );
      })
      .join('');
  }

  function renderArtists() {
    var byId = {};
    state.live.forEach(function (m) { byId[m.id] = m; });

    el.artistGrid.innerHTML = state.members
      .map(function (member) {
        var info = byId[member.id] || {};
        var isLive = !!info.live;
        var photo = info.profile
          ? '<img src="' + escapeHtml(info.profile) + '" alt="' + escapeHtml(member.name) + '" loading="lazy">'
          : '';
        var role = member.role
          ? '<div class="artist-role">' + escapeHtml(member.role) + '</div>'
          : '';

        return (
          '<a class="artist-card ' + (isLive ? 'is-live' : 'is-offline') + '" ' +
          'href="' + escapeHtml(info.stationUrl || 'https://www.sooplive.com/station/' + member.id) + '" ' +
          'target="_blank" rel="noopener">' +
            '<div class="artist-photo">' + photo +
              (isLive ? '<span class="artist-live-tag">LIVE</span>' : '') +
            '</div>' +
            '<div class="artist-name">' + escapeHtml(member.name) + '</div>' +
            role +
          '</a>'
        );
      })
      .join('');

    var liveCount = state.live.filter(function (m) { return m.live; }).length;
    el.artistCount.textContent = state.members.length + '명 · 방송 중 ' + liveCount + '명';
  }

  function loadLive(manual) {
    var url = '/api/live' + (manual ? '?refresh=1' : '');
    el.liveStatus.textContent = '불러오는 중…';

    return getJson(url)
      .then(function (data) {
        state.live = data.members || [];
        renderLive();
        renderArtists();

        var when = data.updatedAt ? new Date(data.updatedAt) : new Date();
        var label = when.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        el.liveStatus.textContent = label + ' 기준';
      })
      .catch(function (error) {
        el.liveStatus.textContent = '불러오지 못했어요';
        el.liveList.innerHTML = '';
        el.liveEmpty.hidden = false;
        el.liveEmpty.textContent = '방송 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
        console.error(error);
      });
  }

  /* ---------------------------------------------------------------- */
  /* FEED                                                              */
  /* ---------------------------------------------------------------- */

  function renderFilters() {
    var counts = {};
    state.posts.forEach(function (post) {
      counts[post.memberId] = (counts[post.memberId] || 0) + 1;
    });

    var chips = ['<button type="button" class="chip' +
      (state.activeFilter === 'all' ? ' is-active' : '') +
      '" data-filter="all">전체 ' + state.posts.length + '</button>'];

    state.members.forEach(function (member) {
      var count = counts[member.id] || 0;
      if (!count) return;
      chips.push(
        '<button type="button" class="chip' +
        (state.activeFilter === member.id ? ' is-active' : '') +
        '" data-filter="' + escapeHtml(member.id) + '">' +
        escapeHtml(member.name) + ' ' + count + '</button>'
      );
    });

    el.feedFilters.innerHTML = chips.join('');
  }

  function renderFeed() {
    var posts = state.activeFilter === 'all'
      ? state.posts
      : state.posts.filter(function (post) { return post.memberId === state.activeFilter; });

    if (!posts.length) {
      el.feedList.innerHTML = '';
      el.feedEmpty.hidden = false;
      return;
    }

    el.feedEmpty.hidden = true;
    el.feedList.innerHTML = posts
      .map(function (post) {
        var thumb = post.thumb
          ? '<img class="feed-thumb" src="' + escapeHtml(post.thumb) + '" alt="" loading="lazy" ' +
            'onerror="this.style.display=&quot;none&quot;">'
          : '';
        var board = post.bbsName
          ? '<span class="feed-board">' + escapeHtml(post.bbsName) + '</span>'
          : '';
        var summary = post.summary
          ? '<p class="feed-summary">' + escapeHtml(post.summary) + '</p>'
          : '';

        return (
          '<a class="feed-item" href="' + escapeHtml(post.url) + '" target="_blank" rel="noopener">' +
            thumb +
            '<div class="feed-main">' +
              '<div class="feed-top">' +
                '<span class="feed-author">' + escapeHtml(post.memberName) + '</span>' +
                board +
                '<span>' + escapeHtml(timeAgo(post.regDate)) + '</span>' +
              '</div>' +
              '<h3 class="feed-title">' + escapeHtml(post.title) + '</h3>' +
              summary +
              '<div class="feed-stats">' +
                '<span>조회 ' + escapeHtml(formatCount(post.readCnt) || '0') + '</span>' +
                '<span>댓글 ' + escapeHtml(formatCount(post.commentCnt) || '0') + '</span>' +
                '<span>추천 ' + escapeHtml(formatCount(post.likeCnt) || '0') + '</span>' +
              '</div>' +
            '</div>' +
          '</a>'
        );
      })
      .join('');
  }

  function loadFeed(manual) {
    var url = '/api/feed?limit=80' + (manual ? '&refresh=1' : '');

    return getJson(url)
      .then(function (data) {
        state.posts = data.posts || [];
        renderFilters();
        renderFeed();

        if (data.since) {
          el.feedStatus.textContent = data.since + '부터 수집 · ' + state.posts.length + '개';
        }
        el.feedEmpty.textContent =
          '아직 모인 글이 없어요. ' + (data.since || '') + '부터 쌓입니다.';
      })
      .catch(function (error) {
        el.feedStatus.textContent = '불러오지 못했어요';
        el.feedEmpty.hidden = false;
        el.feedEmpty.textContent = '글을 불러오지 못했어요.';
        console.error(error);
      });
  }

  /* ---------------------------------------------------------------- */
  /* 이벤트 + 시작                                                     */
  /* ---------------------------------------------------------------- */

  el.feedFilters.addEventListener('click', function (event) {
    var button = event.target.closest('.chip');
    if (!button) return;
    state.activeFilter = button.getAttribute('data-filter');
    renderFilters();
    renderFeed();
  });

  el.liveRefresh.addEventListener('click', function () {
    var since = Date.now() - state.lastManualRefresh;
    if (since < REFRESH_COOLDOWN_MS) return;

    state.lastManualRefresh = Date.now();
    el.liveRefresh.disabled = true;
    el.liveRefresh.textContent = '갱신 중…';

    Promise.all([loadLive(true), loadFeed(true)]).then(function () {
      setTimeout(function () {
        el.liveRefresh.disabled = false;
        el.liveRefresh.textContent = '새로고침';
      }, REFRESH_COOLDOWN_MS);
    });
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) loadLive(false);
  });

  getJson('/api/members')
    .then(function (data) {
      state.members = data.members || [];
      renderArtists();
    })
    .catch(function (error) {
      console.error(error);
    })
    .then(function () {
      loadLive(false);
      loadFeed(false);
      setInterval(function () {
        if (!document.hidden) loadLive(false);
      }, LIVE_POLL_MS);
    });
})();
