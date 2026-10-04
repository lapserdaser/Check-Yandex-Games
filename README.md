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

## 👤 Автор и правообладатели

* **Автор веб-приложения CheckYG:** **Denis ([@lapserdaser](https://github.com/lapserdaser))** — разработка архитектуры, браузерной SPA-версии, интерфейса, портирования на JSZip и адаптации.
* **Первоисточник правил проверки:** Создано на базе открытого скрипта [Nioris/yandex-games-debug-checker](https://github.com/Nioris/yandex-games-debug-checker) (Copyright (c) 2026 3/9 Games), распространяемого по лицензии MIT.
* *Уведомление:* **3/9 Games не является автором данного веб-приложения.** Проект CheckYG является самостоятельной производной работой на основе открытых правил проверки.
* **Официальные правила:** [Требования Яндекс Игр к сборкам](https://yandex.ru/dev/games/doc/ru/concepts/requirements)

---

## 📄 Лицензия и отказ от ответственности

Проект распространяется по условиям лицензии **MIT**:

```text
CheckYG Web Application
Copyright (c) 2026 Denis (lapserdaser)

Based on yandex-games-debug-checker:
Copyright (c) 2026 3/9 Games
```

### ⚠️ Отказ от ответственности (AS IS):
Программное обеспечение предоставляется **«КАК ЕСТЬ» (AS IS)**, без каких-либо явных или подразумеваемых гарантий. Ни оригинальные авторы базы проверок (**3/9 Games**), ни автор веб-приложения (**Denis**) **не несут ответственности** за любые ошибки в проверках, сбои в работе, результаты прохождения модерации в Яндекс Играх, потерю данных или финансовые убытки. Инструмент носит исключительно вспомогательный и рекомендательный характер.
