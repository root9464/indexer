import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const CacheContext = createContext();

export const useCache = () => {
  const context = useContext(CacheContext);
  if (!context) {
    throw new Error('useCache must be used within CacheProvider');
  }
  return context;
};

export const CacheProvider = ({ children }) => {
  const [cache, setCache] = useState(() => {
    // Безопасная инициализация кеша из localStorage
    if (typeof window !== 'undefined') {
      try {
        const savedCache = localStorage.getItem('app-cache');
        return savedCache ? JSON.parse(savedCache) : {};
      } catch {
        return {};
      }
    }
    return {};
  });
  
  const [loading, setLoading] = useState({});
  const requestsInProgress = useRef(new Map()); // Используем Map для хранения промисов
  const abortControllers = useRef(new Map()); // Для отмены запросов

  // Генерируем ключ кеша на основе параметров
  const generateCacheKey = (endpoint, params = {}) => {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((result, key) => {
        result[key] = params[key];
        return result;
      }, {});
    return `${endpoint}_${JSON.stringify(sortedParams)}`;
  };

  // Проверяем, не истек ли кеш
  const isCacheValid = (cacheEntry, maxAge = 5 * 60 * 1000) => {
    if (!cacheEntry) return false;
    return Date.now() - cacheEntry.timestamp < maxAge;
  };

  // Основная функция получения данных с защитой от дублирования
  const getCachedData = useCallback(async (
    endpoint, 
    fetchFunction, 
    params = {}, 
    options = {}
  ) => {
    const { 
      maxAge = 5 * 60 * 1000, // 5 минут по умолчанию
      forceRefresh = false,
      useStaleWhileRevalidate = true,
      signal // Внешний AbortSignal
    } = options;

    const cacheKey = generateCacheKey(endpoint, params);

    // Проверяем, есть ли уже выполняющийся запрос
    if (requestsInProgress.current.has(cacheKey) && !forceRefresh) {
      // Возвращаем существующий промис
      return requestsInProgress.current.get(cacheKey);
    }

    const cachedEntry = cache[cacheKey];
    const isValid = isCacheValid(cachedEntry, maxAge);

    // Если есть валидный кеш и не принудительное обновление
    if (isValid && !forceRefresh) {
      return cachedEntry.data;
    }

    // Если есть устаревший кеш и включен stale-while-revalidate
    if (cachedEntry && useStaleWhileRevalidate && !forceRefresh) {
      // Возвращаем устаревшие данные, но запускаем обновление в фоне
      setTimeout(() => {
        getCachedData(endpoint, fetchFunction, params, { 
          ...options, 
          forceRefresh: true, 
          useStaleWhileRevalidate: false 
        }).catch(console.warn);
      }, 0);
      return cachedEntry.data;
    }

    // Создаем новый запрос
    const fetchPromise = (async () => {
      // Создаем AbortController для этого запроса
      const abortController = new AbortController();
      abortControllers.current.set(cacheKey, abortController);

      // Объединяем сигналы отмены
      const combinedSignal = signal ? 
        AbortSignal.any ? AbortSignal.any([signal, abortController.signal]) : abortController.signal
        : abortController.signal;

      setLoading(prev => ({ ...prev, [cacheKey]: true }));

      try {
        // Выполняем запрос с сигналом отмены
        const data = await fetchFunction({ 
          ...params, 
          signal: combinedSignal 
        });
        
        // Проверяем, не был ли запрос отменен
        if (combinedSignal.aborted) {
          throw new Error('Request was aborted');
        }
        
        // Сохраняем в кеш
        const cacheEntry = {
          data,
          timestamp: Date.now(),
          endpoint,
          params
        };

        setCache(prev => ({
          ...prev,
          [cacheKey]: cacheEntry
        }));

        return data;

      } catch (error) {
        // Если запрос отменен, не показываем ошибку
        if (error.name === 'AbortError' || combinedSignal.aborted) {
          throw error;
        }

        // При ошибке возвращаем кешированные данные если есть
        if (cachedEntry) {
          console.warn(`API request failed, returning cached data for ${endpoint}:`, error);
          return cachedEntry.data;
        }
        throw error;
      } finally {
        // Очищаем состояние загрузки и промис
        setLoading(prev => {
          const newLoading = { ...prev };
          delete newLoading[cacheKey];
          return newLoading;
        });
        requestsInProgress.current.delete(cacheKey);
        abortControllers.current.delete(cacheKey);
      }
    })();

    // Сохраняем промис для предотвращения дублирования
    requestsInProgress.current.set(cacheKey, fetchPromise);

    return fetchPromise;
  }, [cache]);

  // Отмена всех активных запросов
  const cancelAllRequests = useCallback(() => {
    for (const [cacheKey, controller] of abortControllers.current) {
      controller.abort();
    }
    abortControllers.current.clear();
    requestsInProgress.current.clear();
  }, []);

  // Отмена конкретного запроса
  const cancelRequest = useCallback((endpoint, params = {}) => {
    const cacheKey = generateCacheKey(endpoint, params);
    const controller = abortControllers.current.get(cacheKey);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(cacheKey);
      requestsInProgress.current.delete(cacheKey);
    }
  }, []);

  // Инвалидация кеша
  const invalidateCache = useCallback((pattern) => {
    setCache(prev => {
      const newCache = { ...prev };
      Object.keys(newCache).forEach(key => {
        if (pattern instanceof RegExp ? pattern.test(key) : key.includes(pattern)) {
          delete newCache[key];
        }
      });
      return newCache;
    });
  }, []);

  // Очистка всего кеша
  const clearCache = useCallback(() => {
    cancelAllRequests();
    setCache({});
    setLoading({});
  }, [cancelAllRequests]);

  // Получение статуса загрузки
  const isLoading = useCallback((endpoint, params = {}) => {
    const cacheKey = generateCacheKey(endpoint, params);
    return loading[cacheKey] || false;
  }, [loading]);

  // Добавляем алиас для совместимости
  const isCacheLoading = useCallback((endpoint, params = {}) => {
    return isLoading(endpoint, params);
  }, [isLoading]);

  // Предзагрузка данных
  const preloadData = useCallback(async (endpoint, fetchFunction, params = {}) => {
    try {
      await getCachedData(endpoint, fetchFunction, params, { useStaleWhileRevalidate: false });
    } catch (error) {
      console.warn(`Preload failed for ${endpoint}:`, error);
    }
  }, [getCachedData]);

  // Безопасная очистка устаревшего кеша
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      setCache(prevCache => {
        const now = Date.now();
        const cleaned = {};
        
        Object.entries(prevCache).forEach(([key, entry]) => {
          if (entry && entry.timestamp && now - entry.timestamp < 60 * 60 * 1000) {
            cleaned[key] = entry;
          }
        });
        
        return cleaned;
      });
    }, 10 * 60 * 1000); // Очищаем каждые 10 минут

    return () => clearInterval(cleanupInterval);
  }, []);

  // Безопасное сохранение в localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const criticalData = Object.fromEntries(
          Object.entries(cache).filter(([key]) => 
            key.includes('process-gifts') || key.includes('collections-summary')
          )
        );
        localStorage.setItem('app-cache', JSON.stringify(criticalData));
      } catch (error) {
        console.warn('Failed to save cache to localStorage:', error);
      }
    }
  }, [cache]);

  // Cleanup при размонтировании
  useEffect(() => {
    return () => {
      cancelAllRequests();
    };
  }, []);

  const value = {
    getCachedData,
    invalidateCache,
    clearCache,
    isLoading,
    isCacheLoading, // Добавляем в экспорт
    preloadData,
    cancelRequest,
    cancelAllRequests,
    cache,
    cacheSize: Object.keys(cache).length,
    activeRequests: requestsInProgress.current.size
  };

  return (
    <CacheContext.Provider value={value}>
      {children}
    </CacheContext.Provider>
  );
};
