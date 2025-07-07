import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTelegram } from '../hooks/useTelegram';
import { processUserGifts } from '../utils/api';
import { openTelegramSettings, openTelegramSettingsAlternative } from '../utils/telegram';
import SubscriptionRequiredPage from '../components/SubscriptionRequiredPage';
import { trackPageView, trackExplorePageView, trackGiftClick, trackButtonClick } from '../utils/metrics';
import DatabaseUpdateNotification from '../components/DatabaseUpdateNotification';

// Компонент скелетона для карточки баланса
const BalanceCardSkeleton = () => (
  <div className="bg-gradient-to-b from-blue-500 to-blue-600 rounded-2xl p-4 mb-6 text-white relative overflow-hidden">
    <div className="relative z-10">
      <div className="flex items-baseline gap-3 mb-3">
        <div className="animate-pulse bg-white/20 rounded-lg h-8 w-32"></div>
        <div className="animate-pulse bg-white/20 rounded-lg h-6 w-16"></div>
      </div>
      <div className="animate-pulse bg-white/30 rounded-full h-6 w-20"></div>
    </div>
    {/* Анимированные точки на фоне */}
    <div className="absolute inset-0 opacity-20">
      <div className="absolute top-4 right-4 w-2 h-2 bg-white rounded-full animate-ping"></div>
      <div className="absolute top-12 right-8 w-1 h-1 bg-white rounded-full animate-ping" style={{animationDelay: '0.5s'}}></div>
      <div className="absolute bottom-8 right-12 w-1.5 h-1.5 bg-white rounded-full animate-ping" style={{animationDelay: '1s'}}></div>
    </div>
  </div>
);

// Компонент скелетона для списка подарков
const GiftListSkeleton = () => (
  <div className="space-y-1 px-3">
    {[...Array(12)].map((_, index) => (
      <div key={index} className="flex items-center justify-between py-3 animate-pulse">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-gray-200 rounded-full mr-3 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
          </div>
          <div>
            <div className="bg-gray-200 rounded h-4 w-24 mb-2 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
            </div>
            <div className="bg-gray-200 rounded h-3 w-16 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="bg-gray-200 rounded h-4 w-20 mb-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
          </div>
          <div className="bg-gray-200 rounded h-3 w-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

// Компонент прогресс бара в стиле Telegram
const TelegramProgressBar = ({ progress = 0 }) => (
  <div className="w-full bg-gray-200 rounded-full h-1 mb-4">
    <div 
      className="bg-blue-500 h-1 rounded-full transition-all duration-300 ease-out"
      style={{ width: `${progress}%` }}
    ></div>
  </div>
);

const ExplorePage = () => {
  const { isAuthenticated, user, getUsername, getUserPhoto, isInitializing } = useTelegram();
  const [activeTab, setActiveTab] = useState('gifts');
  const [portfolioData, setPortfolioData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState(null);
  const [totalValue, setTotalValue] = useState(0);
  const [totalGifts, setTotalGifts] = useState(0);
  const [tonPrice, setTonPrice] = useState(3.0);
  const [chartData, setChartData] = useState([]);
  const [portfolioChange, setPortfolioChange] = useState(0);
  const [sortDirection, setSortDirection] = useState('desc');
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  const [showDatabaseUpdateNotification, setShowDatabaseUpdateNotification] = useState(false);
  const navigate = useNavigate();
  
  // Ref для предотвращения дублирования запросов
  const fetchInProgress = useRef(false);

  // Симулируем прогресс загрузки
  useEffect(() => {
    if (loading) {
      setLoadingProgress(0);
      
      const interval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 15;
        });
      }, 200);

      return () => clearInterval(interval);
    } else {
      setLoadingProgress(100);
    }
  }, [loading]);

  // Отслеживаем просмотр страницы при успешной загрузке данных
  useEffect(() => {
    if (!loading && !error && portfolioData.length >= 0 && isAuthenticated && !isInitializing) {
      trackExplorePageView(portfolioData, getUsername(), user?.id);
    }
  }, [loading, error, portfolioData, isAuthenticated, isInitializing, user?.id]);

  // ОСНОВНОЙ useEffect для загрузки данных
  useEffect(() => {
    const fetchPortfolioData = async () => {
      // Ждем завершения инициализации перед запросом
      if (isInitializing) {
        return;
      }

      // Предотвращаем дублирование вызовов
      if (fetchInProgress.current) {
        return;
      }

      try {
        fetchInProgress.current = true;
        setLoading(true);
        setLoadingProgress(0);
        setError(null);
        setSubscriptionRequired(false);
        
        // Показываем скелетоны даже если нет авторизации, но проверяем username если авторизован
        if (isAuthenticated) {
          const username = getUsername();
          if (!username || username.trim() === '') {
            setError('Username not found. Please set a username (@username) in your Telegram settings to use this app.');
            setLoading(false);
            return;
          }
        }
        
        setLoadingProgress(20);
        
        const data = await processUserGifts();
        setLoadingProgress(60);
        
        // Получаем курс TON из ответа API и используем его
        const currentTonPrice = data.ton_price || 3.0;
        setTonPrice(currentTonPrice);
        
        // Обрабатываем данные для графика
        const weeklyData = {};
        if (data.results && Array.isArray(data.results)) {
          data.results.forEach(item => {
            if (item.dt && typeof item.dt === 'string') {
              const date = item.dt.split('T')[0];
              if (!weeklyData[date] && typeof item.total_balance === 'number') {
                weeklyData[date] = item.total_balance;
              }
            }
          });
        }
        
        const sortedDates = Object.keys(weeklyData).sort();
        const chartPoints = sortedDates.map(date => weeklyData[date]);
        setChartData(chartPoints);
        
        // Рассчитываем процентное изменение портфеля на основе реальных данных
        if (data.results && data.results.length > 0) {
          let changePercent = 0;

          // Используем данные из weeklyData для расчета изменения портфеля
          if (sortedDates.length >= 2) {
            const latestBalance = weeklyData[sortedDates[sortedDates.length - 1]];
            const previousBalance = weeklyData[sortedDates[sortedDates.length - 2]];
            
            if (previousBalance > 0) {
              changePercent = ((latestBalance - previousBalance) / previousBalance) * 100;
            }
          }

          setPortfolioChange(changePercent);
        }

        // Правильно группируем по уникальным gift_id и берем только последние записи
        const uniqueGifts = {};
        if (data.results && Array.isArray(data.results)) {
          data.results.forEach(item => {
            if (item?.gift_id) {
              const existing = uniqueGifts[item.gift_id];
              if (!existing || new Date(item.dt) > new Date(existing.dt)) {
                uniqueGifts[item.gift_id] = item;
              }
            }
          });
        }

        const uniqueGiftsArray = Object.values(uniqueGifts);

        // Проверяем на пустое портфолио ПОСЛЕ группировки
        if (uniqueGiftsArray.length === 0) {
          setError('no_gifts_found');
          return;
        }

        // Группируем по коллекциям и агрегируем данные на основе последних записей
        const collections = {};
        uniqueGiftsArray.forEach(item => {
          if (item.collection) {
            const collectionKey = item.collection;
            if (!collections[collectionKey]) {
              collections[collectionKey] = {
                collection: item.collection,
                median_price: 0,
                gift_count: 0,
                per_day_changes: [],
                weighted_changes: [],
                total_value: 0,
                model_value: item.model_value || '',
                backdrop: item.backdrop || null,
                png: item.png || '',
                dt: item.dt || new Date().toISOString()
              };
            }
            
            if (typeof item.median_price === 'number') {
              collections[collectionKey].median_price += item.median_price;
              collections[collectionKey].total_value += item.median_price;
            }
            collections[collectionKey].gift_count += 1;
            
            // Используем per_day_change из последней записи подарка
            if (item.per_day_change && typeof item.per_day_change === 'number' && !isNaN(item.per_day_change)) {
              const giftValue = item.median_price || 0;
              collections[collectionKey].per_day_changes.push(item.per_day_change);
              collections[collectionKey].weighted_changes.push({
                change: item.per_day_change,
                weight: giftValue
              });
            }
            
            // Обновляем данные только если текущая запись более свежая
            if (item.dt && new Date(item.dt) > new Date(collections[collectionKey].dt)) {
              collections[collectionKey].model_value = item.model_value || '';
              collections[collectionKey].backdrop = item.backdrop || null;
              collections[collectionKey].png = item.png || '';
              collections[collectionKey].dt = item.dt;
            }
          }
        });

        // Преобразуем в формат для отображения
        const portfolioItems = Object.values(collections).map(item => {
          let avgChange = 0;

          // Используем взвешенное среднее по стоимости подарков
          if (item.weighted_changes.length > 0) {
            const totalWeight = item.weighted_changes.reduce((sum, wc) => sum + wc.weight, 0);
            if (totalWeight > 0) {
              const weightedSum = item.weighted_changes.reduce((sum, wc) => sum + (wc.change * wc.weight), 0);
              avgChange = weightedSum / totalWeight;
            }
          } else if (item.per_day_changes.length > 0) {
            // Fallback к простому среднему арифметическому
            avgChange = item.per_day_changes.reduce((sum, change) => sum + change, 0) / item.per_day_changes.length;
          }

          const iconUrl = item.png || '';

          return {
            id: `${item.collection}_${Date.now()}`,
            name: item.collection || 'Unknown Collection',
            price: item.median_price || 0,
            change: `${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(1)}%`,
            gifts: item.gift_count || 0,
            icon: iconUrl,
            isImage: true,
            color: 'bg-purple-500'
          };
        });

        setPortfolioData(portfolioItems);
        
        // Подсчитываем общую стоимость и итоговое изменение портфолио
        const totalTON = uniqueGiftsArray.reduce((sum, item) => {
          return sum + (typeof item.median_price === 'number' ? item.median_price : 0);
        }, 0);
        const totalGiftsCount = uniqueGiftsArray.length;
        
        // Вычисляем итоговое изменение портфеля на основе взвешенного среднего
        let portfolioChangePercent = 0;
        if (uniqueGiftsArray.length > 0) {
          const totalWeight = uniqueGiftsArray.reduce((sum, item) => sum + (item.median_price || 0), 0);
          if (totalWeight > 0) {
            const weightedChangeSum = uniqueGiftsArray.reduce((sum, item) => {
              const change = item.per_day_change || 0;
              const weight = item.median_price || 0;
              return sum + (change * weight);
            }, 0);
            portfolioChangePercent = weightedChangeSum / totalWeight;
          }
        }
        
        setTotalValue(totalTON);
        setTotalGifts(totalGiftsCount);
        setPortfolioChange(portfolioChangePercent);
        
        setLoadingProgress(100);
        
      } catch (error) {
        if (error.code === 'SUBSCRIPTION_REQUIRED' || error.message === 'SUBSCRIPTION_REQUIRED') {
          setSubscriptionRequired(true);
          setLoading(false);
          return;
        }
        
        // Обработка FLOOD_WAIT ошибки
        if (error.code === 'FLOOD_WAIT_ERROR') {
          setError('telegram_flood_wait');
          setPortfolioData([]);
          setChartData([]);
          setTotalValue(0);
          setTotalGifts(0);
          setLoading(false);
          return;
        }
        
        setError(error.message);
        setPortfolioData([]);
        setChartData([]);
        setTotalValue(0);
        setTotalGifts(0);
      } finally {
        setLoading(false);
        fetchInProgress.current = false;
      }
    };

    fetchPortfolioData();
  }, [isAuthenticated, getUsername, isInitializing ]);

  const tabs = [
    { id: 'gifts', label: 'My Gifts', active: true },
    { id: 'market', label: 'Market Cap', active: false },
    { id: 'volume', label: 'Volume', active: false },
    { id: 'gainers', label: 'Gainers', active: false }
   
  ];

  // Добавляем сортировку портфолио
  const sortedPortfolioData = [...portfolioData].sort((a, b) => {
    const priceA = a?.price || 0;
    const priceB = b?.price || 0;
    return sortDirection === 'desc' ? priceB - priceA : priceA - priceB;
  });

  const handleTabClick = (tabId) => {
    // Отслеживаем клик по табу
    trackButtonClick(`tab_${tabId}`, {
      from_tab: activeTab,
      to_tab: tabId,
      user_has_gifts: portfolioData.length > 0,
      portfolio_value: totalValue
    });

    setActiveTab(tabId);
    if (tabId === 'market') {
      navigate('/market');
    } else if (tabId === 'gainers') {
      navigate('/gainers');
    } else if (tabId === 'volume') {
      navigate('/volume');
    }
  };

  const handleSort = () => {
    // Отслеживаем изменение сортировки
    trackButtonClick('sort_portfolio', {
      current_direction: sortDirection,
      new_direction: sortDirection === 'desc' ? 'asc' : 'desc',
      portfolio_size: portfolioData.length,
      total_value: totalValue
    });

    setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
  };

  // Функция для обработки клика по подарку
  const handleGiftClick = (gift) => {
    trackGiftClick(`collection_${gift.id}`, {
      collection_name: gift.name,
      gift_count: gift.gifts,
      total_value: gift.price,
      usd_value: gift.price * tonPrice,
      change_percent: gift.change
    });
  };

  // Проверяем наличие нулевых значений в данных портфолио
  const hasZeroValues = useMemo(() => {
    if (!portfolioData || portfolioData.length === 0) return false;
    
    // Проверяем есть ли коллекции с нулевой ценой
    const hasZeroPrices = portfolioData.some(item => 
      item?.price === 0 || item?.price === null || item?.price === undefined
    );
    
    // Проверяем общую сумму портфолио
    const hasZeroTotal = totalValue === 0 && portfolioData.length > 0;
    
    return hasZeroPrices || hasZeroTotal;
  }, [portfolioData, totalValue]);

  // Показываем уведомление при обнаружении нулевых значений
  useEffect(() => {
    if (!loading && !error && hasZeroValues && !isInitializing) {
      setShowDatabaseUpdateNotification(true);
    }
  }, [loading, error, hasZeroValues, isInitializing]);

  // Показываем скелетоны когда loading = true ИЛИ во время инициализации ИЛИ когда нет авторизации
  if (loading || isInitializing || !isAuthenticated) {
    return (
      <div className="relative min-h-screen bg-white">
        <div className="overflow-y-auto pb-20 px-4 py-4" style={{height: '100vh'}}>
          
          {/* Скелетон для User Info */}
          <div className="flex justify-center mb-4">
            <div className="inline-flex items-center border border-gray-200 rounded-2xl px-3 py-2 bg-gray-50 shadow-sm animate-pulse">
              <div className="w-5 h-5 bg-gray-200 rounded-full mr-2"></div>
              <div className="bg-gray-200 rounded h-4 w-32"></div>
            </div>
          </div>

          {/* Прогресс бар только если идет загрузка */}
          {loading && <TelegramProgressBar progress={loadingProgress} />}
          
          {/* Скелетон карточки баланса */}
          <BalanceCardSkeleton />

          {/* Скелетон табов */}
          <div className="flex mb-4 gap-2 justify-between">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="py-2 px-2 flex-1 text-center animate-pulse">
                <div className="bg-gray-200 rounded h-4 w-full"></div>
              </div>
            ))}
          </div>

          {/* Заголовок портфолио */}
          <div className="flex justify-between items-center mb-1">
            <div className="bg-gray-200 rounded h-3 w-20 animate-pulse"></div>
            <div className="bg-gray-200 rounded h-3 w-16 animate-pulse"></div>
          </div>

          {/* Скелетон списка подарков */}
          <GiftListSkeleton />
        </div>
      </div>
    );
  }

  // Показываем страницу подписки
  if (subscriptionRequired) {
    return (
      <SubscriptionRequiredPage 
        onCheckAgain={() => {
          setSubscriptionRequired(false);
          window.location.reload();
        }}
      />
    );
  }

  if (error) {
    // Специальная обработка для FLOOD_WAIT
    if (error === 'telegram_flood_wait') {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
          <div className="text-center max-w-xs mx-auto p-5 bg-white rounded-2xl shadow-xl border border-gray-100">
            <div className="text-5xl mb-3">⏳</div>
            <h2 className="text-lg font-bold mb-2 text-gray-800">Updating Data</h2>
            <p className="text-gray-600 mb-3 leading-relaxed text-sm">
              We're currently updating our gift data. Please wait <strong>30 minutes</strong> and try again.
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-left">
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <span className="text-blue-500 text-lg">🔄</span>
                </div>
                <div className="ml-2">
                  <h3 className="font-semibold text-blue-800 mb-1 text-xs">Why the wait?</h3>
                  <p className="text-xs text-blue-700">
                    Telegram limits how often we can fetch gift data to prevent spam. This ensures reliable service for everyone.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200 shadow-lg text-sm"
              >
                Try Again
              </button>
              
              <button
                onClick={() => navigate('/market')}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200 text-sm"
              >
                Explore Market
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Специальная обработка для приватного профиля
    if (error === 'privacy_restricted') {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
          <div className="text-center max-w-xs mx-auto p-5 bg-white rounded-2xl shadow-xl border border-gray-100">
            <div className="text-5xl mb-3">🔒</div>
            <h2 className="text-lg font-bold mb-2 text-gray-800">Private Profile</h2>
            <p className="text-gray-600 mb-3 leading-relaxed text-sm">
              This user has restricted access to their gift collection.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200 shadow-lg text-sm"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    // Специальная обработка для случая без подарков
    if (error === 'no_gifts_found') {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
          <div className="text-center max-w-xs mx-auto p-5 bg-white rounded-2xl shadow-xl border border-gray-100">
            <div className="text-5xl mb-3">🎁</div>
            <h2 className="text-lg font-bold mb-2 text-gray-800">No Gifts Collection</h2>
            <p className="text-gray-600 mb-3 leading-relaxed text-sm">
              This profile doesn't have any opened Star Gifts yet.
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-left">
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <span className="text-blue-500 text-lg">💡</span>
                </div>
                <div className="ml-2">
                  <h3 className="font-semibold text-blue-800 mb-1 text-xs">How to build a collection:</h3>
                  <ol className="text-xs text-blue-700 space-y-0.5">
                    <li>• Receive Star Gifts in Telegram</li>
                    <li>• <strong>Open received gifts</strong></li>
                    <li>• Watch your collection grow!</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200 shadow-lg text-sm"
              >
                Check Again
              </button>
              
              <button
                onClick={() => navigate('/market')}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200 text-sm"
              >
                Explore Market
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Специальная обработка для ошибки username
    if (error.includes('Username not found') || error.includes('username')) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
          <div className="text-center max-w-xs mx-auto p-5 bg-white rounded-2xl shadow-xl border border-gray-100">
            <div className="text-4xl mb-3">👤</div>
            <h2 className="text-lg font-bold mb-2 text-gray-800">Username Required</h2>
            <p className="text-gray-600 mb-3 leading-relaxed text-sm">
              You need to set up a <strong>username</strong> in your Telegram account to use this app.
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-left">
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <span className="text-blue-500 text-lg">📝</span>
                </div>
                <div className="ml-2">
                  <h3 className="font-semibold text-blue-800 mb-1 text-xs">How to set username:</h3>
                  <ol className="text-xs text-blue-700 space-y-0.5">
                    <li>1. Open Telegram Settings</li>
                    <li>2. Go to "Username" section</li>
                    <li>3. Choose your unique @username</li>
                    <li>4. Save changes</li>
                    <li>5. <strong>Wait 5 minutes</strong> for changes to take effect</li>
                    <li>6. Return to this app and refresh</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  openTelegramSettings();
                }}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200 shadow-lg text-sm"
              >
                How to Set Username
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200 text-sm"
              >
                Refresh Page
              </button>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Current user: {user?.first_name || 'Unknown'} {user?.last_name || ''}</p>
              <p className="text-xs text-gray-400 mb-1">User ID: {user?.id || 'Unknown'}</p>
              <p className="text-xs text-gray-400">Username found: {getUsername() || 'None'}</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="text-center max-w-xs mx-auto p-5 bg-white rounded-2xl shadow-xl border border-gray-100">
          <div className="text-red-500 text-5xl mb-3">❌</div>
          <h2 className="text-lg font-bold mb-2 text-gray-800">Error Loading Data</h2>
          <p className="text-gray-600 mb-4 text-sm">{error}</p>
          {error.includes('authorization') && (
            <p className="text-xs text-gray-500">
              Please make sure you're accessing this app through Telegram.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-white">
      {/* Database Update Notification */}
      <DatabaseUpdateNotification
        isVisible={showDatabaseUpdateNotification}
        onClose={() => setShowDatabaseUpdateNotification(false)}
        position="top"
        autoHideDelay={10000}
      />
      
      <div className="overflow-y-auto pb-20 px-4 py-4" style={{height: '100vh'}}>
        {/* User Info */}
        <div className="flex justify-center mb-4">
          <div className="inline-flex items-center border border-gray-300 rounded-2xl px-3 py-2 bg-white shadow-sm">
            {getUserPhoto() ? (
              <img 
                src={getUserPhoto()} 
                alt="User avatar"
                className="w-5 h-5 rounded-full mr-2 object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : (
              <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center mr-2">
                <span className="text-white text-xs font-bold">
                  {user?.first_name?.[0] || 'U'}
                </span>
              </div>
            )}
            <div className="w-5 h-5 bg-blue-500 rounded-full items-center justify-center mr-2 hidden">
              <span className="text-white text-xs font-bold">
                {user?.first_name?.[0] || 'U'}
              </span>
            </div>
            <span className="text-gray-700 font-bold text-sm">
              @{getUsername() || 'user'} • {totalValue.toFixed(2)} TON •  
            </span>
            <span className="text-orange-500 font-bold text-sm"> 🎁 {totalGifts}</span>
          </div>
        </div>

        {/* Balance Card */}
        <div className="bg-gradient-to-b from-blue-500 to-blue-600 rounded-2xl p-4 mb-6 text-white relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-baseline gap-3 mb-3">
              <div className="text-2xl font-bold">
                {loading ? '...' : `$${(totalValue * tonPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
              <div className={`text-green-400 text-l font-medium ${portfolioChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {portfolioChange >= 0 ? '+' : ''}{portfolioChange.toFixed(1)}%
              </div>
            </div>
            <div className="bg-white rounded-full px-3 py-1 inline-block">
              <span className="text-xs text-black font-medium">
                Gifts • {loading ? '...' : totalGifts}
              </span>
            </div>
          </div>
          {/* Chart based on real data */}
          <div className="absolute bottom-4 right-4 w-24 h-12">
            <svg viewBox="0 0 80 40" className="w-full h-full">
              {chartData.length > 1 && (
                <polyline
                  fill="none"
                  stroke="white"
                  strokeWidth="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={chartData.map((value, index) => {
                    const x = (index / (chartData.length - 1)) * 75;
                    const minVal = Math.min(...chartData);
                    const maxVal = Math.max(...chartData);
                    const range = maxVal - minVal || 1;
                    const y = 35 - ((value - minVal) / range) * 25;
                    return `${x},${y}`;
                  }).join(' ')}
                  opacity="0.8"
                />
              )}
            </svg>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex mb-4 gap-2 justify-between">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`py-2 px-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex-1 text-center ${
                activeTab === tab.id
                  ? 'text-blue-500 border-blue-500'
                  : 'text-gray-400 border-transparent hover:text-blue-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Portfolio Header */}
        <div className="flex justify-between items-center mb-1">
          <span className="text-gray-500 text-xs font-medium">PORTFOLIO</span>
          <button 
            onClick={handleSort}
            className="text-gray-500 text-xs font-medium flex items-center gap-1"
          >
            SORT BY 
            <div className="flex flex-col items-center justify-center ml-1">
              <svg 
                width="10" 
                height="6" 
                viewBox="0 0 10 6" 
                className={`transition-colors ${sortDirection === 'asc' ? 'fill-blue-500' : 'fill-gray-300'}`}
              >
                <path d="M5 0L0 6h10L5 0z" strokeWidth="0.5"/>
              </svg>
              <svg 
                width="10" 
                height="6" 
                viewBox="0 0 10 6" 
                className={`transition-colors ${sortDirection === 'desc' ? 'fill-blue-500' : 'fill-gray-300'}`}
                style={{ marginTop: '1px' }}
              >
                <path d="M5 6L10 0H0l5 6z" strokeWidth="0.5"/>
              </svg>
            </div>
          </button>
        </div>

        {/* Gifts List */}
        <div className="space-y-1 px-3">
          {sortedPortfolioData.map((gift) => (
            <div 
              key={gift.id} 
              className="flex items-center justify-between py-3 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
              onClick={() => handleGiftClick(gift)}
            >
              <div className="flex items-center">
                <div 
                  className={`w-10 h-10 flex items-center justify-center mr-3 overflow-hidden`}
                >
                  {gift.isImage ? (
                    <img 
                      src={gift.icon} 
                      alt={gift.name}
                      className="w-10 h-10 object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : (
                    <span className="text-lg">{gift.icon}</span>
                  )}
                  <div className={`w-10 h-10 ${gift.color} rounded-full items-center justify-center hidden`}>
                    <span className="text-white text-xs font-bold">{gift.name[0]}</span>
                  </div>
                </div>
                <div>
                  <div className="font-medium text-gray-900">{gift.name}</div>
                  <div className="text-sm text-gray-500">
                    {gift.gifts} Gifts
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium text-gray-900">${(gift.price * tonPrice).toFixed(2)}</div>
                <div className={`text-sm ${gift.change.startsWith('+') ? 'text-green-500' : gift.change.startsWith('-') ? 'text-red-500' : 'text-gray-500'}`}>
                  {gift.change}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ExplorePage;
