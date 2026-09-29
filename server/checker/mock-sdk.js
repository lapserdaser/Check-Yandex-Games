/**
 * Mock Yandex Games SDK v2.0 for Local Simulation & Sandbox Testing
 * Emulates the official /sdk.js environment for games tested in CheckYG.
 */
(function(window) {
  'use strict';

  var _currentLang = 'ru';
  var _soundMuted = false;
  var _eventLog = [];

  function logEvent(name, data) {
    var item = {
      event: name,
      time: performance.now(),
      timestamp: new Date().toLocaleTimeString(),
      data: data || {}
    };
    _eventLog.push(item);
    console.log('[CheckYG Mock SDK] ' + name, data || '');
    try {
      if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'YG_MOCK_SDK_EVENT', payload: item }, window.location.origin || '*');
      }
    } catch(e) {}
  }

  // Create Mock ysdk instance
  function createYSDK(options) {
    options = options || {};
    var ysdk = {
      environment: {
        get i18n() {
          return {
            get lang() {
              logEvent('environment.i18n.lang accessed', { lang: _currentLang });
              return _currentLang;
            },
            set lang(val) {
              _currentLang = val;
            },
            tld: 'ru'
          };
        },
        app: { id: 'checkyg-simulation-app' },
        browser: { lang: _currentLang }
      },
      deviceInfo: {
        type: /mobile|android|iphone|ipad/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        isMobile: function() { return this.type === 'mobile'; },
        isDesktop: function() { return this.type === 'desktop'; },
        isTablet: function() { return false; },
        isTV: function() { return false; }
      },
      screen: {
        fullscreen: {
          status: 'off',
          request: function() {
            logEvent('screen.fullscreen.request');
            return document.documentElement.requestFullscreen ? document.documentElement.requestFullscreen() : Promise.resolve();
          },
          exit: function() {
            logEvent('screen.fullscreen.exit');
            return document.exitFullscreen ? document.exitFullscreen() : Promise.resolve();
          }
        }
      },
      features: {
        LoadingAPI: {
          ready: function() {
            logEvent('features.LoadingAPI.ready called');
            return Promise.resolve();
          }
        },
        GameplayAPI: {
          start: function() {
            logEvent('features.GameplayAPI.start called');
            return Promise.resolve();
          },
          stop: function() {
            logEvent('features.GameplayAPI.stop called');
            return Promise.resolve();
          }
        },
        GamesAPI: {}
      },
      adv: {
        showFullscreenAdv: function(config) {
          config = config || {};
          logEvent('adv.showFullscreenAdv called', config);
          var callbacks = config.callbacks || {};

          // Notify overlay simulation in parent
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'YG_AD_OVERLAY_START', adType: 'interstitial' }, window.location.origin || '*');
          }

          if (typeof callbacks.onOpen === 'function') {
            try { callbacks.onOpen(); } catch(e) { console.error(e); }
            logEvent('adv.showFullscreenAdv onOpen');
          }

          return new Promise(function(resolve) {
            setTimeout(function() {
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'YG_AD_OVERLAY_END', adType: 'interstitial' }, window.location.origin || '*');
              }
              if (typeof callbacks.onClose === 'function') {
                try { callbacks.onClose(true); } catch(e) { console.error(e); }
                logEvent('adv.showFullscreenAdv onClose');
              }
              resolve();
            }, 1200);
          });
        },
        showRewardedVideo: function(config) {
          config = config || {};
          logEvent('adv.showRewardedVideo called', config);
          var callbacks = config.callbacks || {};

          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'YG_AD_OVERLAY_START', adType: 'rewarded' }, window.location.origin || '*');
          }

          if (typeof callbacks.onOpen === 'function') {
            try { callbacks.onOpen(); } catch(e) { console.error(e); }
            logEvent('adv.showRewardedVideo onOpen');
          }

          return new Promise(function(resolve) {
            setTimeout(function() {
              if (typeof callbacks.onRewarded === 'function') {
                try { callbacks.onRewarded(); } catch(e) { console.error(e); }
                logEvent('adv.showRewardedVideo onRewarded');
              }
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'YG_AD_OVERLAY_END', adType: 'rewarded' }, window.location.origin || '*');
              }
              if (typeof callbacks.onClose === 'function') {
                try { callbacks.onClose(); } catch(e) { console.error(e); }
                logEvent('adv.showRewardedVideo onClose');
              }
              resolve();
            }, 1500);
          });
        },
        getBannerAdvStatus: function() {
          return Promise.resolve({ stickyAdvIsShowing: false });
        },
        showBannerAdv: function() {
          logEvent('adv.showBannerAdv called');
          return Promise.resolve({ result: true });
        },
        hideBannerAdv: function() {
          logEvent('adv.hideBannerAdv called');
          return Promise.resolve({ result: true });
        }
      },
      player: {
        getName: function() { return 'CheckYG Tester'; },
        getPhoto: function(size) { return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="100%" height="100%" fill="%23f5a623"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23fff" font-size="28">Y</text></svg>'; },
        getUniqueID: function() { return 'player-simulated-uid-999'; },
        getIDsPerGame: function() { return Promise.resolve([{ appID: 'checkyg', userID: 'player-simulated-uid-999' }]); },
        getMode: function() { return 'lite'; },
        setData: function(data, flush) {
          logEvent('player.setData called', data);
          try {
            localStorage.setItem('checkyg_sim_player_data', JSON.stringify(data));
          } catch(e) {}
          return Promise.resolve();
        },
        getData: function(keys) {
          logEvent('player.getData called', keys);
          var stored = {};
          try {
            stored = JSON.parse(localStorage.getItem('checkyg_sim_player_data') || '{}');
          } catch(e) {}
          return Promise.resolve(stored);
        },
        setStats: function(stats) {
          logEvent('player.setStats called', stats);
          return Promise.resolve();
        },
        getStats: function(keys) {
          logEvent('player.getStats called', keys);
          return Promise.resolve({});
        },
        incrementStats: function(increments) {
          logEvent('player.incrementStats called', increments);
          return Promise.resolve({});
        }
      },
      getPlayer: function(opts) {
        logEvent('ysdk.getPlayer called', opts);
        return Promise.resolve(this.player);
      },
      payments: {
        getCatalog: function() {
          logEvent('payments.getCatalog called');
          return Promise.resolve([
            {
              id: 'starter_pack',
              title: 'Набор новичка',
              description: '100 золота и бонусный сундук',
              imageURI: 'https://yandex.ru/favicon.ico',
              price: '99',
              priceValue: '99.00',
              priceCurrencyCode: 'RUB',
              getPriceCurrencyImage: function(size) { return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><text y="15" font-size="14">₽</text></svg>'; }
            },
            {
              id: 'vip_pass',
              title: 'VIP Пропуск',
              description: 'Отключение рекламы на 30 дней',
              imageURI: 'https://yandex.ru/favicon.ico',
              price: '299',
              priceValue: '299.00',
              priceCurrencyCode: 'RUB',
              getPriceCurrencyImage: function(size) { return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><text y="15" font-size="14">₽</text></svg>'; }
            }
          ]);
        },
        getPurchases: function() {
          logEvent('payments.getPurchases called');
          return Promise.resolve([]);
        },
        purchase: function(opts) {
          logEvent('payments.purchase called', opts);
          return Promise.resolve({
            productID: (opts && opts.id) || 'unknown',
            purchaseToken: 'simulated_token_' + Date.now()
          });
        },
        consumePurchase: function(token) {
          logEvent('payments.consumePurchase called', { token: token });
          return Promise.resolve();
        }
      },
      getPayments: function(opts) {
        logEvent('ysdk.getPayments called', opts);
        return Promise.resolve(this.payments);
      },
      leaderboards: {
        getLeaderboardDescription: function(name) {
          logEvent('leaderboards.getLeaderboardDescription called', { name: name });
          return Promise.resolve({
            appID: 'checkyg-simulation-app',
            default: true,
            name: name,
            title: { en: 'Top Players', ru: 'Лучшие игроки' }
          });
        },
        setScore: function(name, score, extraData) {
          logEvent('leaderboards.setScore called', { name: name, score: score, extraData: extraData });
          return Promise.resolve();
        },
        setLeaderboardScore: function(name, score, extraData) {
          return this.setScore(name, score, extraData);
        },
        getEntries: function(name, options) {
          logEvent('leaderboards.getEntries called', { name: name, options: options });
          return Promise.resolve({
            leaderboard: { name: name },
            ranges: [{ start: 0, size: 5 }],
            userRank: 1,
            entries: [
              { score: 1050, extraData: '', rank: 1, player: { publicName: 'Tester Pro', uniqueID: 'p1' } },
              { score: 850, extraData: '', rank: 2, player: { publicName: 'Champion_77', uniqueID: 'p2' } }
            ]
          });
        },
        getLeaderboardEntries: function(name, options) {
          return this.getEntries(name, options);
        },
        getPlayerEntry: function(name) {
          logEvent('leaderboards.getPlayerEntry called', { name: name });
          return Promise.resolve({
            score: 1050,
            extraData: '',
            rank: 1,
            player: { publicName: 'CheckYG Tester', uniqueID: 'player-simulated-uid-999' }
          });
        },
        getLeaderboardPlayerEntry: function(name) {
          return this.getPlayerEntry(name);
        }
      },
      getLeaderboards: function() {
        logEvent('ysdk.getLeaderboards called');
        return Promise.resolve(this.leaderboards);
      },
      feedback: {
        canReview: function() {
          logEvent('feedback.canReview called');
          return Promise.resolve({ value: true });
        },
        requestReview: function() {
          logEvent('feedback.requestReview called');
          return Promise.resolve({ feedbackSent: true });
        }
      },
      clipboard: {
        writeText: function(text) {
          logEvent('clipboard.writeText called', { length: text.length });
          return navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.resolve();
        }
      },
      shortcut: {
        canShowPrompt: function() { return Promise.resolve({ canShowPrompt: true }); }, // FIX #19: исправлена опечатка canShowPromise → canShowPrompt
        showPrompt: function() {
          logEvent('shortcut.showPrompt called');
          return Promise.resolve({ outcome: 'accepted' });
        }
      }
    };

    window.ysdk = ysdk;
    return ysdk;
  }

  // YaGames global bootstrap
  window.YaGames = {
    init: function(options) {
      logEvent('YaGames.init called', options);
      return new Promise(function(resolve) {
        setTimeout(function() {
          var sdk = createYSDK(options);
          resolve(sdk);
        }, 30);
      });
    }
  };

  // Listen for commands from CheckYG host window
  window.addEventListener('message', function(event) {
    if (!event.data || !event.data.type) return;

    if (event.data.type === 'CHECKYG_SET_LANG') {
      _currentLang = event.data.lang || 'ru';
      logEvent('Language changed from simulator control: ' + _currentLang);
    }
    else if (event.data.type === 'CHECKYG_SIMULATE_AD') {
      // FIX #6: реальная симуляция рекламы через Mock SDK — вызывает настоящие коллбэки игры
      var adType = event.data.adType || 'interstitial';
      logEvent('CHECKYG_SIMULATE_AD triggered', { adType: adType });
      if (window.ysdk && window.ysdk.adv) {
        if (adType === 'rewarded') {
          window.ysdk.adv.showRewardedVideo({ callbacks: {} });
        } else {
          window.ysdk.adv.showFullscreenAdv({ callbacks: {} });
        }
      }
    }
    else if (event.data.type === 'CHECKYG_SIMULATE_TAB_HIDE') {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      logEvent('Simulated tab hidden (visibilitychange)');
    }
    else if (event.data.type === 'CHECKYG_SIMULATE_TAB_SHOW') {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      logEvent('Simulated tab visible (visibilitychange)');
    }
  });

  logEvent('Mock Yandex SDK ready in frame');
})(window);
