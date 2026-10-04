# CheckYG ⚡

**Бесплатный онлайн-инструмент для проверки готовности HTML5-игры к публикации в [Яндекс Играх](https://yandex.ru/games/).**

[![GitHub Pages](https://img.shields.io/badge/demo-live-brightgreen?logo=github)](https://lapserdaser.github.io/Check-Yandex-Games)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🚀 Использование

**Открыть онлайн:** **[lapserdaser.github.io/Check-Yandex-Games](https://lapserdaser.github.io/Check-Yandex-Games)**

1. Упакуйте игру в ZIP-архив (с `index.html` в корне)
2. Перетащите архив на страницу или нажмите для выбора файла
3. Получите детальный отчёт о соответствии требованиям Яндекс Игр

> 🔒 **Приватность:** Ваш файл анализируется прямо в браузере — никуда не отправляется.

---

## 📊 Что проверяется

| Категория | Описание |
|-----------|----------|
| 📦 **Архив и структура** | `index.html` в корне, размер до 100 МБ, отсутствие кириллицы в именах файлов |
| 🔌 **Интеграция SDK** | `<script src="/sdk.js">`, `YaGames.init()` |
| 🔄 **Lifecycle API** | `LoadingAPI.ready()` при полной загрузке |
| 🔊 **Управление звуком** | `visibilitychange`, `AudioContext suspend/resume` |
| 📺 **Interstitial реклама** | `showFullscreenAdv` + `onOpen`/`onClose`/`onError` коллбэки |
| 🎬 **Rewarded реклама** | `showRewardedVideo` + `onRewarded` коллбэк |
| 💾 **Облачные сохранения** | `player.setData()` / `player.getData()` |
| 💰 **IAP покупки** | `getPayments`, `consumePurchase`, `getCatalog` |
| 🌐 **Локализация** | `environment.i18n.lang`, фоллбек CНГ → ru |
| 📱 **UX / Мобильная адаптация** | viewport, overflow, touch-action, contextmenu |
| ⚠️ **Опасные конструкции** | `alert()`, `confirm()`, `eval()`, внешние CDN |
| ⭐ **Качество и тонкости** | WebGL notices, e.code vs e.key, URL-gating |
| 🏆 **Таблицы рекордов** | `ysdk.leaderboards`, `setScore()` |

---

## 🛠️ Запуск локально (Node.js сервер)

Если хотите запустить с полным предпросмотром WebGL-игр:

```bash
git clone https://github.com/lapserdaser/Check-Yandex-Games.git
cd Check-Yandex-Games/server
npm install
npm start
# Открыть: http://localhost:3000
```

---

## 🏗️ Архитектура проекта

```
checkyg/
├── docs/               # GitHub Pages (браузерная SPA)
│   ├── index.html      # Точка входа
│   ├── app.js          # Логика фронтенда (ES module)
│   ├── engine.js       # Движок статического анализа (портирован для браузера)
│   └── style.css       # Стили
├── server/             # Опциональный Node.js сервер (предпросмотр WebGL)
│   ├── server.js       # Express сервер
│   ├── checker/        # Серверный движок анализа + Mock SDK
│   └── package.json
└── README.md
```

---

## 👥 Авторы и благодарности

* **Оригинальные правила и чекер:** [Nioris/yandex-games-debug-checker](https://github.com/Nioris/yandex-games-debug-checker) — **Copyright (c) 2026 3/9 Games**
* **Веб-интерфейс и браузерная редакция:** **CheckYG Contributors / Denis ([@lapserdaser](https://github.com/lapserdaser))**
* **Официальные спецификации:** [Требования Яндекс Игр к сборкам](https://yandex.ru/dev/games/doc/ru/concepts/requirements)

---

## 📄 Лицензия и отказ от ответственности

Проект распространяется под условиями открытой лицензии **MIT**:

```text
Copyright (c) 2026 3/9 Games
Copyright (c) 2026 CheckYG Contributors
```

### ⚠️ Ограничения и отказ от ответственности (AS IS):
Программное обеспечение предоставляется **«КАК ЕСТЬ» (AS IS)**, без каких-либо явных или подразумеваемых гарантий. Оригинальные авторы (**3/9 Games**) и авторы CheckYG **не несут ответственности** за любые ошибки в проверках, сбои, прохождение либо непрохождение модерации в Яндекс Играх, потерю данных или финансовые убытки, возникшие в результате использования данного инструмента. Инструмент носит исключительно вспомогательный и рекомендательный характер.
