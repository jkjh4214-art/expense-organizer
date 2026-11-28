/* 지출 정리 — 서비스워커
 *
 * 전략: Network First
 *   - 항상 네트워크를 먼저 부른다. 성공하면 캐시를 갱신하고 그 응답을 돌려준다.
 *     → 새 버전을 올리면(같은 sw.js 라도 index.html 이 바뀌면) 다음 실행부터 바로 최신 화면이 뜬다.
 *   - 네트워크가 안 되면(오프라인) 캐시에 있던 것을 돌려준다. 화면 이동은 index.html 로 대신한다.
 *   - skipWaiting() + clients.claim() 으로 새 워커가 곧바로 활성화된다.
 *
 * 오프라인에서도 열리도록 앱 화면·아이콘·매니페스트와 외부 SheetJS(CDN)까지 캐시한다.
 */
var CACHE = 'expense-organizer-v14';
var SHELL = ['./', './index.html', './app.webmanifest', './pickle-1795764465990.png', './pickle-1795764462755.png'];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      /* 파일마다 따로 담는다 — 하나가 없어(404) addAll 이 통째로 실패해
         아무것도 못 담는 일이 없게. (배포판은 build_pwa.py 가 이름을 맞춰 준다) */
      return Promise.all(SHELL.map(function (url) {
        return cache.add(url)['catch'](function () { return null; });
      }));
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE) return caches.delete(key);
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }
  if (url.protocol.indexOf('http') !== 0) return;
  /* 캐시에만 묻는 요청은 그대로 통과시킨다(브라우저 Some 규칙) */
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  event.respondWith(networkFirst(request));
});

function networkFirst(request) {
  return fetch(request).then(function (response) {
    if (response && response.status !== 206 && (response.status === 200 || response.type === 'opaque')) {
      var copy = response.clone();
      caches.open(CACHE).then(function (cache) {
        return cache.put(request, copy);
      })['catch'](function () {
        /* 저장 공간이 모자라면 저장만 건너뛴다. */
      });
    }
    return response;
  })['catch'](function () {
    return caches.match(request).then(function (hit) {
      if (hit) return hit;
      if (request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    });
  });
}
