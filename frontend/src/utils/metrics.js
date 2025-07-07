// Утилита для записи метрик пользователей

let sessionId = null;

// Генерируем уникальный ID сессии
const generateSessionId = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Получаем или создаем ID сессии
const getSessionId = () => {
  if (!sessionId) {
    sessionId = sessionStorage.getItem('app_session_id');
    if (!sessionId) {
      sessionId = generateSessionId();
      sessionStorage.setItem('app_session_id', sessionId);
    }
  }
  return sessionId;
};

// Основная функция для записи метрики
export const recordMetric = async (eventType, eventData = {}, page = 'unknown') => {
  try {
    // Получаем информацию о пользователе из контекста Telegram
    const tg = window.Telegram?.WebApp;
    if (!tg?.initDataUnsafe?.user?.id) {
      return false;
    }

    // Валидируем обязательные поля
    if (!eventType || typeof eventType !== 'string') {
      return false;
    }

    const metric = {
      user_id: parseInt(tg.initDataUnsafe.user.id), // Убеждаемся что это число
      event_type: eventType.trim(),
      event_data: eventData || {},
      page: page || window.location.pathname,
      session_id: getSessionId(),
      user_agent: navigator.userAgent,
    };

    // Получаем initData для авторизации
    const initData = tg.initData;
    if (!initData) {
      return false;
    }

    // Отправляем метрику на backend с авторизацией
    const response = await fetch('/api/metrics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': initData,
      },
      body: JSON.stringify(metric),
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json();
    return true;
  } catch (error) {
    return false;
  }
};

// Специализированные функции для разных типов событий
export const trackPopupOpen = (popupType, additionalData = {}) => {
  return recordMetric('popup_open', {
    popup_type: popupType,
    ...additionalData
  }, window.location.pathname);
};

export const trackPageView = (pageName, additionalData = {}) => {
  return recordMetric('page_view', {
    page_name: pageName,
    ...additionalData
  }, pageName); // Передаем pageName как параметр page
};

export const trackGiftClick = (giftId, giftData = {}) => {
  return recordMetric('gift_click', {
    gift_id: giftId,
    ...giftData
  }, window.location.pathname);
};

export const trackButtonClick = (buttonName, additionalData = {}) => {
  return recordMetric('button_click', {
    button_name: buttonName,
    ...additionalData
  }, window.location.pathname);
};

// Добавляем специализированную функцию для портфолио
export const trackPortfolioPageView = (portfolioData, username, userId) => {
  const uniqueGifts = portfolioData?.results ? 
    Object.values(portfolioData.results.reduce((acc, item) => {
      if (item?.gift_id) {
        const existing = acc[item.gift_id];
        if (!existing || new Date(item.dt) > new Date(existing.dt)) {
          acc[item.gift_id] = item;
        }
      }
      return acc;
    }, {})) : [];

  const totalValue = uniqueGifts.reduce((sum, gift) => sum + (gift?.median_price || 0), 0);

  return recordMetric('page_view', {
    page_name: 'portfolio',
    user_id: userId,
    username: username,
    has_gifts: uniqueGifts.length > 0,
    total_gifts: uniqueGifts.length,
    total_value: totalValue
  }, 'portfolio');
};

// Добавляем функцию для отслеживания просмотра страницы исследования
export const trackExplorePageView = (portfolioData, username, userId) => {
  const totalGifts = portfolioData?.length || 0;
  const totalValue = Array.isArray(portfolioData) 
    ? portfolioData.reduce((sum, item) => sum + (item?.price || 0), 0)
    : 0;

  return recordMetric('page_view', {
    page_name: 'explore',
    user_id: userId,
    username: username,
    has_portfolio: totalGifts > 0,
    portfolio_size: totalGifts,
    total_value: totalValue
  }, 'explore');
};

// Добавляем функцию для отслеживания просмотра страницы MarketCap
export const trackMarketCapPageView = (marketCapData, timeframe, currency) => {
  const totalCollections = marketCapData.length;
  const totalMarketCap = marketCapData.reduce((sum, item) => sum + (item.mcap || 0), 0);
  const totalVolume = marketCapData.reduce((sum, item) => sum + (item.volume || 0), 0);

  return recordMetric('page_view', {
    page_name: 'marketcap',
    timeframe: timeframe,
    currency: currency,
    total_collections: totalCollections,
    total_market_cap: totalMarketCap,
    total_volume: totalVolume,
    has_data: totalCollections > 0,
    endpoint_type: 'protected' // указываем что используем защищенный endpoint
  }, 'marketcap');
};

export const trackMarketCapCollectionClick = (collection, timeframe, currency) => {
  return recordMetric('collection_click', {
    collection_id: collection.collection_id,
    collection_name: collection.slug,
    market_cap: collection.mcap,
    volume: collection.volume,
    orders: collection.orders,
    gifts_count: collection.gifts,
    timeframe: timeframe,
    currency: currency,
    source: 'protected_marketcap_endpoint'
  }, 'marketcap');
};

// Добавляем функцию для отслеживания просмотра страницы Gainers
export const trackGainersPageView = (gainersData, timeframe, currency) => {
  const totalGainers = gainersData.filter(item => item.priceChangePercent > 0).length;
  const totalLosers = gainersData.filter(item => item.priceChangePercent < 0).length;
  const avgGain = gainersData.length > 0 ? 
    gainersData.reduce((sum, item) => sum + item.priceChangePercent, 0) / gainersData.length : 0;

  return recordMetric('page_view', {
    page_name: 'gainers',
    timeframe: timeframe,
    currency: currency,
    total_collections: gainersData.length,
    total_gainers: totalGainers,
    total_losers: totalLosers,
    average_gain: avgGain,
    has_data: gainersData.length > 0
  }, 'gainers');
};

export const trackGainersCollectionClick = (collection, timeframe, currency) => {
  return recordMetric('collection_click', {
    collection_id: collection.id,
    collection_name: collection.name,
    price_change: collection.priceChangePercent,
    volume: collection.volumeTON,
    purchases: collection.orders,
    median_price: collection.median_price,
    floor_price: collection.floor_price,
    timeframe: timeframe,
    currency: currency,
    section: 'gainers'
  }, 'gainers');
};
