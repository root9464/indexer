import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { FaDollarSign } from 'react-icons/fa';
import GiftIndexLogo from '../assets/Giftindex_logo.svg';
import { useTelegram } from '../hooks/useTelegram';
import { fetchMarketCapData } from '../utils/api';
import { processUserGifts } from '../utils/api';
import PopupGainersChart from '../components/PopupGainersChart';

// Компонент иконки TON
const TonIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className={className}>
    <path fill="#08C" d="M19.011 9.201L12.66 19.316a.857.857 0 0 1-1.453-.005L4.98 9.197a1.8 1.8 0 0 1-.266-.943a1.856 1.856 0 0 1 1.881-1.826h10.817c1.033 0 1.873.815 1.873 1.822c0 .334-.094.664-.274.951M6.51 8.863l4.632 7.144V8.143H6.994c-.48 0-.694.317-.484.72m6.347 7.144l4.633-7.144c.214-.403-.005-.72-.485-.720h-4.148z"/>
  </svg>
);

// Заглушки для отсутствующих функций трекинга
const trackPageView = (page, data) => {
  // Silent tracking
};

const trackGiftClick = (giftId, data) => {
  // Silent tracking
};

const trackButtonClick = (buttonId, data) => {
  // Silent tracking
};

const tabs = ['My Gifts', 'Market Cap', 'Volume', 'Gainers'];

// Компонент скелетона для карточки статистики покупок
const PurchasesStatsCardSkeleton = () => (
  <div className="bg-white rounded-2xl p-4 relative animate-pulse">
    <div className="absolute top-4 right-1 flex bg-gray-100 rounded-lg p-1">
      <div className="w-8 h-6 bg-gray-200 rounded"></div>
      <div className="w-8 h-6 bg-gray-200 rounded"></div>
    </div>
    
    <div className="mb-5 text-left">
      <div className="flex items-center gap-3 mb-1 -ml-2">
        <div className="flex items-center rounded-lg px-2 py-1">
          <div className="w-3 h-3 bg-gray-200 rounded mr-1"></div>
          <div className="w-16 h-6 bg-gray-200 rounded"></div>
          <div className="w-16 h-4 bg-gray-200 rounded ml-2"></div>
        </div>
      </div>
    </div>

    <div className="w-full h-52 mb-1 relative bg-gray-100 rounded"></div>

    <div className="flex justify-between text-xs text-gray-400 px-4 mb-3 mt-2">
      {[...Array(4)].map((_, index) => (
        <div key={index} className="w-8 h-3 bg-gray-200 rounded"></div>
      ))}
    </div>
  </div>
);

// Компонент скелетона для списка гейнеров
const GainersListSkeleton = () => (
  <div className="space-y-1 px-8">
    {[...Array(10)].map((_, index) => (
      <div key={index} className="flex items-center justify-between py-3 animate-pulse">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-gray-200 rounded-full mr-3"></div>
          <div>
            <div className="w-28 h-4 bg-gray-200 rounded mb-2"></div>
            <div className="w-20 h-3 bg-gray-200 rounded"></div>
          </div>
        </div>
        <div className="text-right">
          <div className="w-24 h-4 bg-gray-200 rounded mb-2"></div>
          <div className="w-16 h-3 bg-gray-200 rounded"></div>
        </div>
      </div>
    ))}
  </div>
);

const GainersPage = () => {
  const { user, isAuthenticated, getUsername, getUserPhoto, isInitializing } = useTelegram();
  const [activeTab, setActiveTab] = useState('Gainers');
  const [activeCurrency, setActiveCurrency] = useState('TON');
  const [activeFilter, setActiveFilter] = useState('UP');
  const [popupOpen, setPopupOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [marketData, setMarketData] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [collections, setCollections] = useState([]);
  const [currentTonPrice, setCurrentTonPrice] = useState(3.0);
  const [topGainers, setTopGainers] = useState([]);
  const [visibleCount, setVisibleCount] = useState(12);
  const [loadingMore, setLoadingMore] = useState(false);
  const [portfolioData, setPortfolioData] = useState(null);
  const [userTotalValue, setUserTotalValue] = useState(0);
  const [userTotalGifts, setUserTotalGifts] = useState(0);
  const [userPortfolioLoading, setUserPortfolioLoading] = useState(false);
  const navigate = useNavigate();
  
  // Ref для предотвращения дублирования запросов
  const fetchInProgress = useRef(false);

  // Мемоизируем функции для предотвращения пересоздания
  const safeNumber = useCallback((value, fallback = 0) => {
    const num = Number(value);
    return isNaN(num) ? fallback : num;
  }, []);

  const calculatePercentChange = useCallback((current, previous) => {
    const curr = Number(current) || 0;
    const prev = Number(previous) || 0;
    if (prev === 0) return 0;
    return ((curr - prev) / prev) * 100;
  }, []);

  const formatNumberWithSpaces = useCallback((num) => {
    const rounded = Math.round(num);
    return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  }, []);

  // Мемоизируем получение уникальных коллекций
  const getUniqueCollections = useCallback((data) => {
    if (!data || !Array.isArray(data)) return [];
    
    const collectionsBySlug = {};
    
    data.forEach(item => {
      const slug = item.slug;
      
      if (!collectionsBySlug[slug] || new Date(item.dt) > new Date(collectionsBySlug[slug].dt)) {
        collectionsBySlug[slug] = item;
      }
    });
    
    return Object.values(collectionsBySlug);
  }, []);

  // Загрузка данных при монтировании компонента
  useEffect(() => {
    // Ждем завершения инициализации Telegram перед загрузкой данных
    if (isInitializing) {
      return;
    }

    // Проверяем аутентификацию перед запросом
    if (!isAuthenticated) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }

    if (dataLoaded) return;
    
    const loadGainersData = async () => {
      if (fetchInProgress.current) return;

      try {
        fetchInProgress.current = true;
        setLoading(true);
        setError(null);

        // Используем защищенный BFF endpoint через fetchMarketCapData
        const result = await fetchMarketCapData();
        
        setMarketData(result);
        setCurrentTonPrice(safeNumber(result.ton_price, 3.0));
        setDataLoaded(true);

        // Отслеживаем просмотр страницы с указанием защищенного endpoint
        trackPageView('gainers', {
          collections_count: result.data?.length || 0,
          ton_price: result.ton_price,
          endpoint_type: 'protected',
          authentication_required: true
        });
        
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        fetchInProgress.current = false;
      }
    };

    loadGainersData();
  }, [isInitializing, isAuthenticated, dataLoaded, safeNumber]); // Добавили зависимости

  // Обработка данных коллекций
  const transformedCollections = useMemo(() => {
    if (!dataLoaded || !marketData?.data) return [];
    
    const uniqueCollections = getUniqueCollections(marketData.data);

    return uniqueCollections.map((item) => {
      const medianPriceChange = calculatePercentChange(
        safeNumber(item.median_price),
        safeNumber(item.prev_day_median_price)
      );
      const floorPriceChange = calculatePercentChange(
        safeNumber(item.floor_price),
        safeNumber(item.prev_day_floor_price)
      );
      const volumeChange = calculatePercentChange(
        safeNumber(item.turnover || item.volume),
        safeNumber(item.prev_day_turnover || item.prev_day_volume)
      );

      const priceChangePercent = medianPriceChange;
      const totalVolumeTON = safeNumber(item.turnover || item.volume);
      const dailyPurchases = safeNumber(item.purchases || item.orders);

      return {
        id: item.collection_id || `${item.slug}-${Date.now()}`,
        name: item.slug || 'Unknown Collection',
        volume: totalVolumeTON,
        volumeTON: totalVolumeTON >= 1000000 ? `${(totalVolumeTON / 1000000).toFixed(1)}M TON` : 
                  totalVolumeTON >= 1000 ? `${(totalVolumeTON / 1000).toFixed(0)}K TON` : `${Math.round(totalVolumeTON)} TON`,
        volumeUSD: totalVolumeTON * currentTonPrice >= 1000000 ? `$${((totalVolumeTON * currentTonPrice) / 1000000).toFixed(1)}M` : 
                   totalVolumeTON * currentTonPrice >= 1000 ? `$${((totalVolumeTON * currentTonPrice) / 1000).toFixed(1)}K` : `$${Math.round(totalVolumeTON * currentTonPrice)}`,
        change: `${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%`,
        purchases: formatNumberWithSpaces(dailyPurchases),
        total_purchases: dailyPurchases,
        total_volume: totalVolumeTON,
        icon: item.png || '🎁',
        isImage: item.png?.startsWith('http'),
        color: 'bg-purple-500',
        isNegative: priceChangePercent < 0,
        // Дополнительные поля для попапа
        median_price: Math.round(safeNumber(item.median_price)),
        floor_price: Math.round(safeNumber(item.floor_price)),
        priceChangePercent: priceChangePercent,
        floorPriceChange: floorPriceChange,
        volumeChange: volumeChange,
        orders: dailyPurchases,
        gifts_count: safeNumber(item.gifts_count),
        date: item.dt || new Date().toISOString()
      };
    });
  }, [dataLoaded, marketData, currentTonPrice, getUniqueCollections, calculatePercentChange, safeNumber, formatNumberWithSpaces]);

  // Обновляем состояние collections только когда действительно изменились данные
  useEffect(() => {
    if (transformedCollections.length > 0) {
      setCollections(transformedCollections);
      
      // Топ-3 по количеству покупок за сутки
      const top3Gainers = transformedCollections
        .sort((a, b) => b.total_purchases - a.total_purchases)
        .slice(0, 3);
      setTopGainers(top3Gainers);
    }
  }, [transformedCollections]);

  // Мемоизируем генерацию данных графика
  const chartData = useMemo(() => {
    if (topGainers.length === 0 || !marketData?.data) return [];
    
    const dataByDate = {};
    
    marketData.data.forEach(item => {
      const dateKey = item.dt ? item.dt.split('T')[0] : new Date().toISOString().split('T')[0];
      
      if (!dataByDate[dateKey]) {
        dataByDate[dateKey] = {};
      }
      
      if (
        !dataByDate[dateKey][item.slug] ||
        new Date(item.dt || 0).getTime() > new Date(dataByDate[dateKey][item.slug].dt || 0).getTime()
      ) {
        dataByDate[dateKey][item.slug] = item;
      }
    });

    const sortedDates = Object.keys(dataByDate).sort();
    const chartData = sortedDates.map((dateKey) => {
      const dataPoint = {
        time: new Date(dateKey).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
        date: dateKey
      };
      
      const uniqueCollectionsForDay = Object.values(dataByDate[dateKey]);
      const totalPurchasesForDay = uniqueCollectionsForDay.reduce((sum, item) => 
        sum + safeNumber(item.purchases || item.orders), 0
      );
      
      dataPoint.totalPurchases = totalPurchasesForDay;
      
      topGainers.forEach((gainer) => {
        const key = gainer.name.toLowerCase().replace(/\s+/g, '_');
        const dayData = dataByDate[dateKey][gainer.name];
        
        if (dayData) {
          const currPurchases = Number(dayData.purchases) || 0;
          dataPoint[key] = currPurchases;
          dataPoint[`${key}_purchases`] = currPurchases;
        } else {
          dataPoint[key] = 0;
          dataPoint[`${key}_purchases`] = 0;
        }
      });
      
      return dataPoint;
    });
    
    return chartData.slice(-30);
  }, [topGainers, marketData, safeNumber]);

  // Мемоизируем статистику покупок
  const purchasesStats = useMemo(() => {
    if (!marketData?.data || collections.length === 0) {
      return {
        totalPurchases: '568',
        currentPurchases: '568'
      };
    }
    
    const dailyPurchases = collections.reduce((sum, collection) => sum + collection.total_purchases, 0);
    
    return {
      totalPurchases: formatNumberWithSpaces(Math.round(dailyPurchases)),
      currentPurchases: formatNumberWithSpaces(Math.round(dailyPurchases))
    };
  }, [marketData, collections, formatNumberWithSpaces]);

  // Мемоизируем вычисления для оси Y
  const chartMaxPurchases = useMemo(() => {
    if (!chartData || !chartData.length) return 1000;
    return Math.max(...chartData.map(d => d.totalPurchases || 0), 1000);
  }, [chartData]);

  const yMarkers = useMemo(() => {
    const max = chartMaxPurchases;
    return [
      Math.round(max),
      Math.round(max * 0.75),
      Math.round(max * 0.5),
      Math.round(max * 0.25),
      0
    ];
  }, [chartMaxPurchases]);

  // Мемоизируем функцию получения данных графика для коллекции
  const getChartDataForCollection = useCallback((collection) => {
    if (!marketData?.data || !collection) return [];
    
    const sorted = marketData.data
      .filter(item => item.collection_id === collection.id)
      .sort((a, b) => new Date(a.dt) - new Date(b.dt));

    return sorted.map(item => {
      const currPurchases = Number(item.purchases) || 0;
      const prevPurchases = Number(item.prev_day_purchases) || 0;
      const purchasesChange = prevPurchases ? ((currPurchases - prevPurchases) / prevPurchases) * 100 : 0;
      
      const currMedianPrice = Number(item.median_price) || 0;
      const prevMedianPrice = Number(item.prev_day_median_price) || 0;
      const priceChange = prevMedianPrice ? ((currMedianPrice - prevMedianPrice) / prevMedianPrice) * 100 : 0;
      
      return {
        dt: item.dt,
        purchases: currPurchases,
        median_price: currMedianPrice,
        purchasesChange,
        priceChange,
        orders: currPurchases,
        volume: Number(item.turnover) || 0,
        volumeChange: Number(item.prev_day_turnover) ? 
          ((Number(item.turnover) - Number(item.prev_day_turnover)) / Number(item.prev_day_turnover)) * 100 : 0
      };
    });
  }, [marketData]);

  // Мемоизируем функцию получения изменения покупок для коллекции
  const getPurchasesChangeForCollection = useCallback((collection) => {
    if (!marketData?.data || !collection) return 0;
    
    const items = marketData.data
      .filter(item => item.collection_id === collection.id)
      .sort((a, b) => new Date(b.dt) - new Date(a.dt));
    
    if (!items.length) return 0;
    
    const latest = items[0];
    const curr = Number(latest.purchases) || 0;
    const prev = Number(latest.prev_day_purchases) || 0;
    
    if (!prev) return 0;
    return ((curr - prev) / prev) * 100;
  }, [marketData]);

  // Custom tooltip для графика
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const timeData = payload[0]?.payload?.time;
      const dateData = payload[0]?.payload?.date;
      const tooltipData = payload[0]?.payload;
      const totalPurchases = tooltipData?.totalPurchases || 0;
      
      return (
        <div className="bg-white px-3 py-2 border border-gray-200 rounded shadow-lg">
          {timeData && dateData && (
            <p className="text-gray-600 font-medium text-xs mb-1">
              {`${dateData} ${timeData}`}
            </p>
          )}
          <p className="text-blue-600 font-medium text-sm mb-1">
            Daily: {formatNumberWithSpaces(totalPurchases)} purchases
          </p>
          {payload.map((entry, index) => {
            const collectionName = entry.name;
            const key = collectionName.toLowerCase().replace(/\s+/g, '_');
            const purchases = tooltipData[`${key}_purchases`] || 0;
            
            return (
              <div key={index} className="mb-1">
                <p style={{ color: entry.color }} className="font-medium text-sm">
                  {`${entry.name}: ${formatNumberWithSpaces(purchases)}`}
                </p>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  // Filter collections based on activeFilter и сортировка по purchases
  const filteredCollections = useMemo(() => {
    if (!collections.length) return [];
    
    if (activeFilter === 'UP') {
      // Топ по покупкам (убывание)
      return [...collections]
        .sort((a, b) => b.total_purchases - a.total_purchases);
    } else {
      // Топ по покупкам (возрастание)
      return [...collections]
        .sort((a, b) => a.total_purchases - b.total_purchases);
    }
  }, [collections, activeFilter]);

  // Получаем видимые коллекции для отображения
  const visibleCollections = useMemo(() => {
    return filteredCollections.slice(0, visibleCount);
  }, [filteredCollections, visibleCount]);

  const hasMoreCollections = useMemo(() => {
    return visibleCount < filteredCollections.length;
  }, [visibleCount, filteredCollections.length]);

  // Автоматическая ленивая загрузка при скролле
  useEffect(() => {
    const handleScroll = () => {
      if (loadingMore || !hasMoreCollections) return;

      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      // Если пользователь прокрутил до 80% от высоты страницы
      if (scrollTop + windowHeight >= documentHeight * 0.8) {
        setLoadingMore(true);
        
        setTimeout(() => {
          setVisibleCount(prev => prev + 12);
          setLoadingMore(false);
        }, 300);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadingMore, hasMoreCollections]);

  // Сброс видимых элементов при изменении фильтра
  useEffect(() => {
    setVisibleCount(12);
  }, [activeFilter]);

  const handleCollectionClick = (collection) => {
    trackGiftClick(`gainers_collection_${collection.id}`, {
      collection_name: collection.name,
      price_change: collection.priceChangePercent,
      purchases: collection.orders,
      section: 'gainers'
    });
    
    setSelectedCollection(collection);
    setPopupOpen(true);
  };

  const handleTabClick = (tab) => {
    trackButtonClick(`gainers_tab_${tab.toLowerCase().replace(' ', '_')}`, {
      from_tab: activeTab,
      to_tab: tab
    });

    if (tab === 'My Gifts') {
      navigate('/');
    } else if (tab === 'Market Cap') {
      navigate('/market');
    } else if (tab === 'Volume') {
      navigate('/volume');
    } else {
      setActiveTab(tab);
    }
  };

  // Загружаем данные пользователя для header
  useEffect(() => {
    const loadUserPortfolio = async () => {
      if (!isAuthenticated || isInitializing) return;
      
      try {
        setUserPortfolioLoading(true);
        const userData = await processUserGifts();
        
        if (userData && userData.results && !userData.empty_portfolio) {
          // Группируем по уникальным gift_id
          const uniqueGifts = {};
          userData.results.forEach(item => {
            if (item?.gift_id) {
              const existing = uniqueGifts[item.gift_id];
              if (!existing || new Date(item.dt) > new Date(existing.dt)) {
                uniqueGifts[item.gift_id] = item;
              }
            }
          });
          
          const uniqueGiftsArray = Object.values(uniqueGifts);
          const totalTON = uniqueGiftsArray.reduce((sum, gift) => sum + (gift?.median_price || 0), 0);
          const totalGifts = uniqueGiftsArray.length;
          
          setUserTotalValue(totalTON);
          setUserTotalGifts(totalGifts);
          setPortfolioData(userData);
        }
      } catch (error) {
        console.log('Failed to load user portfolio for header:', error);
      } finally {
        setUserPortfolioLoading(false);
      }
    };

    loadUserPortfolio();
  }, [isAuthenticated, isInitializing]);

  // Показываем загрузку
  if (loading || isInitializing) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center">
        <div className="w-full max-w-lg">
          {/* User Info Header Skeleton */}
          <div className="flex justify-center py-4">
            <div className="inline-flex items-center border border-gray-200 rounded-2xl px-3 py-2 bg-gray-50 shadow-sm animate-pulse">
              <div className="w-5 h-5 bg-gray-200 rounded-full mr-2"></div>
              <div className="bg-gray-200 rounded h-4 w-32"></div>
            </div>
          </div>

          {/* Chart Container Skeleton */}
          <div className="px-2 -mt-3">
            <PurchasesStatsCardSkeleton />
          </div>

          {/* Tabs Skeleton */}
          <div className="px-4 mb-4">
            <div className="flex mb-4 gap-2 justify-between">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="py-2 px-1 flex-1 text-center animate-pulse">
                  <div className="bg-gray-200 rounded h-4 w-full"></div>
                </div>
              ))}
            </div>
          </div>

          {/* Collections Header Skeleton */}
          <div className="px-4 mb-2">
            <div className="flex justify-between items-center">
              <div className="bg-gray-200 rounded h-3 w-20 animate-pulse"></div>
              <div className="flex items-center gap-2">
                {[...Array(2)].map((_, index) => (
                  <div key={index} className="flex items-center gap-1">
                    <div className="w-1 h-1 bg-gray-200 rounded-full"></div>
                    <div className="w-8 h-3 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Gainers List Skeleton */}
          <GainersListSkeleton />
        </div>
      </div>
    );
  }

  // Показываем ошибку
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="text-center max-w-xs mx-auto p-5 bg-white rounded-2xl shadow-xl border border-gray-100">
          <div className="text-red-500 text-5xl mb-3">❌</div>
          <h2 className="text-lg font-bold mb-2 text-gray-800">Error Loading Data</h2>
          <p className="text-gray-600 mb-4 text-sm">{error}</p>
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

  return (
    <div className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-lg">
        {/* User Info Header */}
        <div className="flex justify-center py-4">
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
            <span className="text-gray-700 font-bold text-sm">@{getUsername() || 'user'} • {userTotalValue.toFixed(2)} TON • </span>
            <span className="text-orange-500 font-bold text-sm">🎁 {userTotalGifts}</span>
          </div>
        </div>

        {/* Chart Container */}
        <div className="px-2 -mt-3">
          <div className="bg-white rounded-2xl p-4 relative">
            
            {/* Currency Switch */}
            <div className="absolute top-4 right-1 flex bg-gray-100 rounded-lg p-1 z-20">
              <button
                onClick={() => setActiveCurrency('TON')}
                className={`flex items-center justify-center w-8 h-6 rounded transition-all duration-200 ${
                  activeCurrency === 'TON'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <TonIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveCurrency('USDT')}
                className={`flex items-center justify-center w-8 h-6 rounded transition-all duration-200 ${
                  activeCurrency === 'USDT'
                    ? 'bg-white text-green-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <FaDollarSign className="w-3 h-3" />
              </button>
            </div>

            {/* Top Gainers Display с общей статистикой */}
            <div className="mb-5 text-left">
              <div className="flex items-center justify-start mb-3 ml-2">
                <div className="flex items-center rounded-lg px-2 py-1">
                  <span className="text-blue-500 text-xs mr-1">●</span>
                  <span className="text-lg font-mono font-bold text-blue-500 tracking-wide">
                    {purchasesStats.currentPurchases}
                  </span>
                  <span className="text-gray-500 text-xs ml-2">Total Purchases per day</span>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="w-full h-40 mb-3 relative">
              {/* Водяной знак логотипа позади графика */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <img
                  src={GiftIndexLogo}
                  alt="GiftIndex"
                  className="w-28 h-auto opacity-50"
                  style={{
                    filter: 'grayscale(1) brightness(0.6)'
                  }}
                />
              </div>
              
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ left: 20, right: 22 }}>
                  <XAxis hide />
                  <YAxis 
                    hide
                    domain={[0, 'dataMax + 50']}
                  />
                  <CartesianGrid 
                    horizontal={true} 
                    vertical={false} 
                    stroke="#e5e7eb" 
                    strokeWidth={0.5}
                    strokeOpacity={0.3}
                  />
                  <Tooltip 
                    content={<CustomTooltip />} 
                    animationDuration={150}
                  />
                  {topGainers.slice(0, 3).map((gainer, index) => {
                    const colors = ['#10b981', '#8b5cf6', '#f59e0b'];
                    const key = gainer.name.toLowerCase().replace(/\s+/g, '_');
                    return (
                      <Line
                        key={gainer.id}
                        type="monotone"
                        dataKey={key}
                        stroke={colors[index]}
                        strokeWidth={2}
                        dot={false}
                        name={gainer.name}
                        animationDuration={300}
                      />
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
              
              {/* Volume markers (left side) обновленные для покупок */}
              <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-400 py-2">
                {yMarkers.map((val, idx) => (
                  <span key={idx}>{formatNumberWithSpaces(val)}</span>
                ))}
              </div>
            </div>

            {/* Date markers и Top Gainers (bottom) */}
            <div className="mb-3 mt-2">
              {/* Date markers */}
              <div className="flex justify-between text-xs text-gray-400 px-6 mb-2">
                {chartData.filter((_, index) => index % Math.max(1, Math.ceil(chartData.length / 4)) === 0).map((item, index) => (
                  <span key={index} className="text-xs">{item.time}</span>
                ))}
              </div>
              
              {/* Top Gainers with icons and purchases */}
              <div className="flex items-center justify-center gap-3 px-2">
                {topGainers.slice(0, 3).map((gainer, index) => {
                  const colors = ['text-green-500', 'text-purple-500', 'text-orange-500'];
                  return (
                    <div key={gainer.id} className="flex items-center rounded-lg px-2 py-1">
                      {gainer.isImage ? (
                        <img 
                          src={gainer.icon} 
                          alt={gainer.name}
                          className="w-4 h-4 mr-1 rounded-sm"
                        />
                      ) : (
                        <span className="text-lg mr-1">{gainer.icon}</span>
                      )}
                      <span className={`text-sm font-mono font-bold tracking-wide ${colors[index]}`}>
                        {formatNumberWithSpaces(gainer.total_purchases)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 mb-4">
          <div className="flex mb-4 gap-2 justify-between">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabClick(tab)}
                className={`py-2 px-1 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? 'text-blue-500 border-blue-500'
                    : 'text-gray-400 border-transparent hover:text-blue-400'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Collections Header */}
        <div className="px-4 mb-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-xs font-medium">COLLECTIONS</span>
            <div className="flex items-center gap-2">
              <div className={`w-1 h-1 rounded-full ${
                activeFilter === 'UP' ? 'bg-blue-500' : 'bg-gray-300'
              }`} />
              <button
                onClick={() => {
                  trackButtonClick('gainers_filter_up', {
                    from_filter: activeFilter,
                    collections_count: filteredCollections.length
                  });
                  setActiveFilter('UP');
                }}
                className={`text-xs font-medium transition-colors ${
                  activeFilter === 'UP' ? 'text-blue-500' : 'text-gray-500'
                }`}
              >
                UP
              </button>
              <div className={`w-1 h-1 rounded-full ${
                activeFilter === 'DOWN' ? 'bg-blue-500' : 'bg-gray-300'
              }`} />
              <button
                onClick={() => {
                  trackButtonClick('gainers_filter_down', {
                    from_filter: activeFilter,
                    collections_count: filteredCollections.length
                  });
                  setActiveFilter('DOWN');
                }}
                className={`text-xs font-medium transition-colors ${
                  activeFilter === 'DOWN' ? 'text-blue-500' : 'text-gray-500'
                }`}
              >
                DOWN
              </button>
            </div>
          </div>
        </div>

        {/* Collections List */}
        <div className="space-y-1 px-8">
          {visibleCollections.map((collection) => {
            // вычисляем дельту покупок для коллекции
            const purchasesChange = getPurchasesChangeForCollection(collection);
            return (
              <div 
                key={collection.id} 
                className="flex items-center justify-between py-3 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => handleCollectionClick(collection)}
              >
                <div className="flex items-center">
                  <div className={`w-10 h-10 ${collection.isImage ? '' : collection.color} rounded-full flex items-center justify-center mr-3`}>
                    {collection.isImage ? (
                      <img 
                        src={collection.icon} 
                        alt={collection.name}
                        className="w-10 h-10 object-cover rounded-full"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : (
                      <span className="text-lg">{collection.icon}</span>
                    )}
                    <div className={`w-10 h-10 ${collection.color} rounded-full items-center justify-center hidden`}>
                      <span className="text-white text-xs font-bold">{collection.name[0]}</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{collection.name}</div>
                    <div className="text-sm text-gray-500">
                      {collection.purchases} Purchases
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-gray-900 flex items-center">
                    {activeCurrency === 'TON' ? (
                      <>{formatNumberWithSpaces(collection.volume)} <TonIcon className="w-6 h-6 -mt-1" /></>
                    ) : (
                      collection.volumeUSD
                    )}
                  </div>
                  <div className={`text-sm ${purchasesChange < 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {purchasesChange >= 0 ? '+' : ''}{purchasesChange.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })}
          
          {/* Loading indicator */}
          {loadingMore && (
            <div className="flex justify-center py-4">
              <div className="text-gray-500 text-sm">Loading more collections...</div>
            </div>
          )}
        </div>
      </div>
      
      {/* Popup with chart */}
      <PopupGainersChart
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        collection={selectedCollection}
        chartData={selectedCollection ? getChartDataForCollection(selectedCollection) : []}
        currentTonPrice={currentTonPrice}
        initialCurrency={activeCurrency}
        purchasesChange={selectedCollection ? getPurchasesChangeForCollection(selectedCollection) : 0}
      />
    </div>
  );
};

export default GainersPage;
