import React, { createContext, useContext, useEffect, useState } from 'react';
import { initTelegramWebApp, getTelegramUsername } from '../utils/telegram';

const TelegramContext = createContext();

export const useTelegram = () => {
  const context = useContext(TelegramContext);
  if (!context) {
    throw new Error('useTelegram must be used within TelegramProvider');
  }
  return context;
};

export const TelegramProvider = ({ children }) => {
  const [webApp, setWebApp] = useState(null);
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true); // Добавляем состояние инициализации

  useEffect(() => {
    let timeoutId;

    const initWebApp = () => {
      try {
        const tgData = initTelegramWebApp();
        if (tgData) {
          setWebApp(tgData);
          setUser(tgData.user);
          
          const hasValidData = !!(tgData.initData && tgData.user);
          setIsAuthenticated(hasValidData);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.warn('Telegram Web App initialization failed:', error);
        setIsAuthenticated(false);
      } finally {
        // Устанавливаем завершение инициализации через небольшую задержку
        setTimeout(() => setIsInitializing(false), 500);
      }
    };

    // Проверяем готовность Telegram Web App
    if (window.Telegram && window.Telegram.WebApp) {
      // Небольшая задержка для полной инициализации
      setTimeout(initWebApp, 100);
    } else {
      // Ждем загрузки скрипта Telegram
      let attempts = 0;
      const maxAttempts = 30; // 3 секунды
      
      const checkTelegram = setInterval(() => {
        attempts++;
        
        if (window.Telegram && window.Telegram.WebApp) {
          clearInterval(checkTelegram);
          setTimeout(initWebApp, 100);
        } else if (attempts >= maxAttempts) {
          clearInterval(checkTelegram);
          initWebApp(); // Пробуем инициализировать даже без скрипта
        }
      }, 100);
      
      timeoutId = checkTelegram;
    }

    return () => {
      if (timeoutId) {
        clearInterval(timeoutId);
      }
    };
  }, []);

  const value = {
    webApp,
    user,
    isAuthenticated,
    error,
    isInitializing, // Добавляем в value
    getUserId: () => {
      return user?.id ? user.id.toString() : null;
    },
    getUserName: () => {
      return user?.username || user?.first_name || null;
    },
    getUsername: () => {
      const username = getTelegramUsername() || user?.username || null;
      // Фильтруем автоматически сгенерированные username
      if (username && username.startsWith('user_') && /^user_\d+$/.test(username)) {
        return null;
      }
      return username;
    },
    getUserPhoto: () => {
      return user?.photo_url || null;
    },
    getUserForDisplay: () => {
      if (!user) return null;
      return {
        ...user,
        display_name: user.first_name || 'User',
        username: user.username || null
      };
    },
    isAuthorized: () => {
      const authorized = isAuthenticated && !!user;
      return authorized;
    },
    getAuthStatus: () => {
      if (error) return 'error';
      if (!isAuthenticated) return 'unauthorized';
      
      // Проверяем наличие username
      const username = getTelegramUsername();
      if (!username || (username.startsWith('user_') && /^user_\d+$/.test(username))) return 'no_username';
      
      return 'authorized';
    },
    // Добавляем метод для получения initData
    getInitData: () => {
      const initData = webApp?.initData || null;
      return initData;
    },
    // Добавляем метод для получения полных данных пользователя
    getFullUser: () => {
      return user || null;
    },
    // Добавляем метод для отладки
    getDebugInfo: () => {
      return {
        isAuthenticated,
        error,
        hasWebApp: !!webApp,
        hasUser: !!user,
        hasInitData: !!(webApp?.initData),
        initDataLength: webApp?.initData?.length || 0,
        username: getTelegramUsername(),
        platform: webApp?.platform,
        isInitializing // Добавляем в debug info
      };
    }
  };

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
};
