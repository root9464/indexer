const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || process.env.VITE_API_URL || '/api';

// Функция ожидания загрузки Telegram WebApp
const waitForTelegram = (timeout = 5000) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkTelegram = () => {
      if (window.Telegram?.WebApp) {
        resolve(window.Telegram.WebApp);
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        reject(new Error('Telegram WebApp not available'));
        return;
      }
      
      setTimeout(checkTelegram, 100);
    };
    
    checkTelegram();
  });
};

// Функция для получения Telegram данных
const getTelegramData = async () => {
  try {
    const tg = await waitForTelegram();
    
    let initData = tg.initData;
    const user = tg.initDataUnsafe?.user;

    // Если initData пустая, используем fallback
    if (!initData && tg.initDataUnsafe) {
      initData = JSON.stringify(tg.initDataUnsafe);
    }

    // Дополнительная проверка на пустые данные
    if (!initData || initData.trim() === '') {
      throw new Error('No valid init data from Telegram WebApp');
    }

    // Финальная валидация данных
    const finalData = {
      initData: typeof initData === 'string' ? initData.trim() : JSON.stringify(initData),
      username: user?.username || '',
      userId: user?.id?.toString() || ''
    };

    return finalData;
  } catch (error) {
    throw new Error('Not running in Telegram WebApp or WebApp not ready');
  }
};

// Функция для отправки запросов к BFF с Telegram заголовками
const apiRequest = async (endpoint, options = {}) => {
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 200; // 200ms между попытками
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const telegramData = await getTelegramData();
      
      // Проверяем что у нас есть все необходимые данные
      if (!telegramData.initData || telegramData.initData.trim() === '') {
        throw new Error('Missing or empty Telegram init data');
      }

      const defaultHeaders = {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': telegramData.initData,
        'X-Telegram-Username': telegramData.username,
        'X-Telegram-User-ID': telegramData.userId,
      };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Если 401 и не последняя попытка, повторяем
        if (response.status === 401 && attempt < MAX_RETRIES) {
          console.log(`🔄 Auth failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt)); // Увеличиваем задержку с каждой попыткой
          continue;
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();
      
      // Если дошли до сюда, запрос успешен
      if (attempt > 1) {
        console.log(`✅ Auth successful after ${attempt} attempts`);
      }
      
      return responseData;
    } catch (error) {
      // Если это не 401 или последняя попытка, выбрасываем ошибку
      if (!error.message.includes('401') && !error.message.includes('Missing or empty Telegram init data') || attempt === MAX_RETRIES) {
        console.error(`❌ API request failed after ${attempt} attempts:`, error.message);
        throw error;
      }
      
      // Если это промежуточная попытка при 401, логируем и продолжаем
      console.log(`🔄 API request failed (attempt ${attempt}/${MAX_RETRIES}):`, error.message);
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }
    }
  }
};

// Функция для проверки подписки пользователя на канал
export const checkSubscription = async () => {
  return await apiRequest('/check-subscription', {
    method: 'POST',
  });
};

// Добавляем кеш для marketcap данных
let marketCapCache = {
  data: null,
  timestamp: null,
  ttl: 5 * 60 * 1000 // 5 минут
};

// Добавляем кеш для process-gifts данных
let processGiftsCache = {
  data: null,
  timestamp: null,
  ttl: 30 * 60 * 1000 // 30 минут
};

// Добавляем функцию для получения данных marketcap через BFF
export const fetchMarketCapData = async () => {
  try {
    // Проверяем кеш
    const now = Date.now();
    if (marketCapCache.data && 
        marketCapCache.timestamp && 
        (now - marketCapCache.timestamp) < marketCapCache.ttl) {
      return marketCapCache.data;
    }
    
    // Используем защищенный BFF endpoint вместо прямого обращения к data-service
    const data = await apiRequest('/marketcap');
    
    // Обновляем кеш
    marketCapCache.data = data;
    marketCapCache.timestamp = now;
    
    return data;
  } catch (error) {
    throw error;
  }
};

// Функция для обработки подарков пользователя
export const processUserGifts = async () => {
  try {
    // Проверяем кеш
    const now = Date.now();
    if (processGiftsCache.data && 
        processGiftsCache.timestamp && 
        (now - processGiftsCache.timestamp) < processGiftsCache.ttl) {
      return processGiftsCache.data;
    }

    const data = await apiRequest('/process-gifts', {
      method: 'POST',
    });

    // Кешируем успешный результат
    processGiftsCache.data = data;
    processGiftsCache.timestamp = now;

    return data;
  } catch (error) {
    // Обработка специфичных ошибок
    if (error.message.includes('FLOOD_WAIT')) {
      const floodError = new Error('FLOOD_WAIT_ERROR');
      floodError.code = 'FLOOD_WAIT_ERROR';
      floodError.originalMessage = error.message;
      throw floodError;
    }
    
    // Если ошибка связана с подпиской, пробрасываем специальный тип
    if (error.message.includes('Subscription required') || 
        error.message.includes('SUBSCRIPTION_REQUIRED') ||
        error.message.includes('is not subscribed')) {
      const subscriptionError = new Error('SUBSCRIPTION_REQUIRED');
      subscriptionError.code = 'SUBSCRIPTION_REQUIRED';
      throw subscriptionError;
    }
    
    // В случае ошибки используем кешированные данные если есть
    if (processGiftsCache.data) {
      return processGiftsCache.data;
    }
    
    throw error;
  }
};

// Добавляем функцию для очистки кеша process-gifts
export const clearProcessGiftsCache = () => {
  processGiftsCache.data = null;
  processGiftsCache.timestamp = null;
};

export default {
  processUserGifts,
  checkSubscription,
};
