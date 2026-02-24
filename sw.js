const CACHE_NAME = "reservoir-shell-v2"; // 未來只要前端有大改，就把 v2 往上加

// 把所有讓畫面正常運作的必需品都加進來（包含 CDN 圖表庫）
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
];

// 1. 安裝階段：預先快取所有核心檔案
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting(); // 強制立刻接管，不等待舊版 SW 關閉
});

// 2. 啟動階段：清理舊版本的快取（避免佔用手機空間）
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          // 如果名字是 reservoir-shell 開頭，且不是當前版本，就刪除
          if (name.startsWith("reservoir-shell") && name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  event.waitUntil(self.clients.claim());
});

// 3. 攔截請求階段
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 規則 A：只處理 GET 請求
  if (req.method !== "GET") return;

  // 規則 B：放行 GAS API（因為我們在 index.html 裡已經有獨立的 reservoir-data 快取邏輯了）
  if (url.hostname === "script.google.com") return;

  // 規則 C：其他資源（HTML、Manifest、CDN），採用 Stale-While-Revalidate 策略
  // 概念：先秒速吐出舊快取給畫面，同時偷偷去背景抓新版，下次打開就會是新的。
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(req).then((cachedResponse) => {
        // 發起網路請求去抓最新的
        const fetchPromise = fetch(req).then((networkResponse) => {
          // 確認回應正常，才更新到快取中
          if (networkResponse && networkResponse.ok) {
            cache.put(req, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // 網路斷線時，fetch 會噴錯，這裡把錯誤吞掉不處理
        });

        // 優先回傳快取，如果完全沒快取過（第一次載入），就等待網路回應
        return cachedResponse || fetchPromise;
      });
    })
  );
});