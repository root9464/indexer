import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  LineChart,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { FaDollarSign } from 'react-icons/fa';
import GiftIndexLogo from '../assets/Giftindex_logo.svg';
import CollectionPopup from '../components/CollectionPopup';
import VolumePopup from '../components/VolumePopup';
import { useTelegram } from '../hooks/useTelegram';
import { fetchMarketCapData } from '../utils/api';
import { processUserGifts } from '../utils/api';

// Function for number formatting with spaces
const formatNumberWithSpaces = (num) => {
  const rounded = Math.round(num);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
};

// Компонент иконки TON
const TonIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className={className}>
    <path fill="#08C" d="M19.011 9.201L12.66 19.316a.857.857 0 0 1-1.453-.005L4.98 9.197a1.8 1.8 0 0 1-.266-.943a1.856 1.856 0 0 1 1.881-1.826h10.817c1.033 0 1.873.815 1.873 1.822c0 .334-.094.664-.274.951M6.51 8.863l4.632 7.144V8.143H6.994c-.48 0-.694.317-.484.72m6.347 7.144l4.633-7.144c.214-.403-.005-.72-.485-.720h-4.148z"/>
  </svg>
);

const token = {
  name: 'Tand • 53212 TON',
  symbol: '🎁 34'
};

// Убрали таймфреймы
const tabs = ['My Gifts', 'Market Cap', 'Volume', 'Gainers'];

const VolumePage = () => {
  const { isAuthenticated, user, getUsername, getUserPhoto, isInitializing } = useTelegram();
  const [activeTab, setActiveTab] = useState('Volume');
  const [activeCurrency, setActiveCurrency] = useState('TON');
  const [popupOpen, setPopupOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTonPrice, setCurrentTonPrice] = useState(3.0);
  const [marketData, setMarketData] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [activeFilter, setActiveFilter] = useState('UP');
  const [visibleCount, setVisibleCount] = useState(12);
  const [loadingMore, setLoadingMore] = useState(false);
  const [portfolioData, setPortfolioData] = useState(null);
  const [userTotalValue, setUserTotalValue] = useState(0);
  const [userTotalGifts, setUserTotalGifts] = useState(0);
  const [userPortfolioLoading, setUserPortfolioLoading] = useState(false);
  const navigate = useNavigate();

  // Функция для получения уникальных коллекций (последние записи)
  const getUniqueCollections = (data) => {
    const collectionsBySlug = {};
    
    // Группируем по slug и берем последнюю запись по дате
    data.forEach(item => {
      const slug = item.slug;
      
      if (!collectionsBySlug[slug] || new Date(item.dt) > new Date(collectionsBySlug[slug].dt)) {
        collectionsBySlug[slug] = item;
      }
    });
    
    return Object.values(collectionsBySlug);
  };

  // Функция для получения исторических данных коллекции для графика
  const getChartDataForCollection = (collection) => {
    if (!marketData || !marketData.data || !collection) return [];
    // Фильтруем и сортируем данные по collection_id
    const sorted = marketData.data
      .filter(item => item.collection_id === collection.id)
      .sort((a, b) => new Date(a.dt) - new Date(b.dt));

    // Для каждого дня считаем изменение относительно prev_day_turnover
    return sorted.map(item => {
      const curr = Number(item.turnover) || 0;
      const prev = Number(item.prev_day_turnover) || 0;
      const volumeChange = prev ? ((curr - prev) / prev) * 100 : 0;
      return {
        dt: item.dt,
        volume: curr,
        orders: Number(item.purchases) || 0,
        volumeChange,
      };
    });
  };

  // Функция для вычисления volumeChange для выбранной коллекции
  const getVolumeChangeForCollection = (collection) => {
    if (!marketData || !marketData.data || !collection) return 0;
    // Берём последнюю запись по collection_id
    const items = marketData.data
      .filter(item => item.collection_id === collection.id)
      .sort((a, b) => new Date(b.dt) - new Date(a.dt));
    if (!items.length) return 0;
    const latest = items[0];
    const curr = Number(latest.turnover) || 0;
    const prev = Number(latest.prev_day_turnover) || 0;
    if (!prev) return 0;
    return ((curr - prev) / prev) * 100;
  };

  // Обработчик клика на коллекцию
  const handleCollectionClick = (collection) => {
    setSelectedCollection(collection);
    setPopupOpen(true);
  };

  // Custom tooltip для основного графика
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const turnoverData = payload.find(p => p.dataKey === 'totalTurnover');
      const purchasesData = payload.find(p => p.dataKey === 'totalPurchases');
      const data = payload[0]?.payload;
      
      return (
        <div className="bg-white px-3 py-2 border border-gray-200 rounded shadow-lg">
          <p className="text-gray-600 font-medium text-xs mb-1">
            {data?.date}
          </p>
          {turnoverData && (
            <p className="text-blue-600 font-medium text-sm">
              Turnover: {formatNumberWithSpaces(turnoverData.value)} {activeCurrency === 'TON' ? 'TON' : '$'}
            </p>
          )}
          {purchasesData && (
            <p className="text-green-600 font-medium text-sm">
              Purchases: {formatNumberWithSpaces(purchasesData.value)}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Функция для безопасного вычисления процентного изменения
  const calculatePercentChange = (current, previous) => {
    const curr = Number(current) || 0;
    const prev = Number(previous) || 0;
    if (prev === 0) return 0;
    return ((curr - prev) / prev) * 100;
  };

  // Функция для безопасного преобразования в число с fallback
  const safeNumber = (value, fallback = 0) => {
    const num = Number(value);
    return isNaN(num) ? fallback : num;
  };

  // Загружаем данные Volume при монтировании компонента
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
    
    const loadVolumeData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Используем защищенный BFF endpoint через fetchMarketCapData
        const result = await fetchMarketCapData();
        
        // Сохраняем полные данные рынка
        setMarketData(result);
        setCurrentTonPrice(safeNumber(result.ton_price, 3.0));
        setDataLoaded(true);
        
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadVolumeData();
  }, [isInitializing, isAuthenticated, dataLoaded]); // Добавили зависимости

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

  // Отдельный useEffect для обновления валюты без перезагрузки данных
  useEffect(() => {
    if (!dataLoaded || !marketData) return;
    
    // Получаем только уникальные коллекции
    const uniqueCollections = getUniqueCollections(marketData.data);

    // Преобразуем данные для отображения
    const transformedCollections = uniqueCollections.map((item) => {
      // Берём текущий и прошлый объём (turnover)
      const volumeNow = safeNumber(item.turnover);
      const volumePrev = safeNumber(item.prev_day_turnover);

      // Аналогично для покупок (purchases)
      const ordersNow = safeNumber(item.purchases);
      const ordersPrev = safeNumber(item.prev_day_purchases);

      const volumeInUSD = volumeNow * currentTonPrice;

      // Дельта по объёму и покупкам
      // Исправлено: считаем дельту как (turnover - prev_day_turnover) / prev_day_turnover * 100
      const volumeDelta = volumePrev === 0 ? 0 : ((volumeNow - volumePrev) / volumePrev) * 100;
      const ordersDelta = calculatePercentChange(ordersNow, ordersPrev);
      const isNegative = volumeDelta < 0;

      return {
        id: item.collection_id,
        name: item.slug,
        volume: volumeNow,
        change: `${volumeDelta >= 0 ? '+' : ''}${volumeDelta.toFixed(1)}%`,
        orders: ordersNow,
        gifts: safeNumber(item.gifts_count),
        icon: item.png,
        mcap: volumeInUSD >= 1000000 ? `$${(volumeInUSD / 1000000).toFixed(1)}M` : `$${(volumeInUSD / 1000).toFixed(0)}K`,
        mcapTON: volumeNow >= 1000000 ? `${(volumeNow / 1000000).toFixed(1)}M TON` : `${(volumeNow / 1000).toFixed(0)}K TON`,
        date: item.dt,
        volumeValue: volumeNow,
        isNegative,
        volumeDelta,
        ordersDelta,
        mcap_floor: item.mcap_floor, // добавлено поле
      };
    });

    // Сортируем по volume (убывание)
    transformedCollections.sort((a, b) => b.volumeValue - a.volumeValue);

    setCollections(transformedCollections);
  }, [activeCurrency, currentTonPrice, dataLoaded, marketData]);

  // Мемоизируем тяжелые вычисления для графика
  const volumeChartData = useMemo(() => {
    if (!marketData || !marketData.data) return [];

    // Группируем данные по датам и получаем уникальные коллекции для каждой даты
    const dataByDate = {};

    marketData.data.forEach(item => {
      const dateKey = item.dt ? item.dt.split('T')[0] : new Date().toISOString().split('T')[0];

      if (!dataByDate[dateKey]) {
        dataByDate[dateKey] = {};
      }

      // Для каждой даты храним только последнюю запись каждой уникальной коллекции (по slug)
      if (
        !dataByDate[dateKey][item.slug] ||
        new Date(item.dt || 0).getTime() > new Date(dataByDate[dateKey][item.slug].dt || 0).getTime()
      ) {
        dataByDate[dateKey][item.slug] = item;
      }
    });

    // Вычисляем итоговые данные для каждой даты на основе уникальных коллекций
    const sortedDates = Object.keys(dataByDate).sort();
    const chartData = sortedDates.map((dateKey) => {
      const uniqueCollections = Object.values(dataByDate[dateKey]);
      
      const totalTurnover = uniqueCollections.reduce((sum, collection) => 
        sum + safeNumber(collection.turnover), 0
      );
      const totalPurchases = uniqueCollections.reduce((sum, collection) => 
        sum + safeNumber(collection.purchases), 0
      );

      return {
        date: dateKey,
        totalTurnover: activeCurrency === 'TON' ? totalTurnover : totalTurnover * currentTonPrice,
        totalPurchases: totalPurchases,
        time: new Date(dateKey).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
        dateKey: dateKey
      };
    });

    // Берем последние 30 дней
    return chartData.slice(-30);
  }, [marketData, activeCurrency, currentTonPrice]);

  const volumeStats = useMemo(() => {
    if (!marketData || !marketData.data) {
      return {
        totalVolume: '1234.56',
        totalOrders: '568',
        currentVolume: '1234.56',
        currentOrders: '568',
        endpoint_type: 'protected' // добавляем флаг защищенного endpoint
      };
    }
    
    // Функция для форматирования значений
    const formatValue = (val, currency = '') => {
      if (val >= 1000000) {
        return `${(val / 1000000).toFixed(1)}M${currency ? ' ' + currency : ''}`;
      } else if (val >= 1000) {
        return `${(val / 1000).toFixed(0)}K${currency ? ' ' + currency : ''}`;
      }
      return `${Math.round(val)}${currency ? ' ' + currency : ''}`;
    };
    
    // Используем последние доступные данные
    const getLatestCollectionsBySlug = (data) => {
      const bySlug = {};
      data.forEach(item => {
        const slug = item.slug;
        if (!slug) return;
        
        if (
          !bySlug[slug] ||
          new Date(item.dt || 0).getTime() > new Date(bySlug[slug].dt || 0).getTime()
        ) {
          bySlug[slug] = item;
        }
      });
      return Object.values(bySlug);
    };
    
    const latestCollections = getLatestCollectionsBySlug(marketData.data);
    
    const todayVolume = latestCollections.reduce((sum, item) => sum + safeNumber(item.turnover), 0);
    const todayOrders = latestCollections.reduce((sum, item) => sum + safeNumber(item.purchases), 0);
    
    return {
      totalVolume: activeCurrency === 'TON'
        ? formatNumberWithSpaces(Math.round(todayVolume))
        : formatNumberWithSpaces(Math.round(todayVolume * currentTonPrice)),
      totalOrders: formatNumberWithSpaces(Math.round(todayOrders)),
      currentVolume: activeCurrency === 'TON' 
        ? formatValue(todayVolume)
        : formatValue(todayVolume * currentTonPrice),
      currentOrders: formatValue(todayOrders),
      endpoint_type: 'protected' // добавляем флаг защищенного endpoint
    };
  }, [marketData, activeCurrency, currentTonPrice]);

  // Фильтрация и сортировка коллекций по объёму внутри фильтра UP/DOWN, не учитывая дельту
  const filteredCollections = useMemo(() => {
    if (activeFilter === 'UP') {
      // Все коллекции, сортировка по убыванию (DESC)
      return [...collections].sort((a, b) => b.volumeValue - a.volumeValue);
    } else {
      // Все коллекции, сортировка по возрастанию (ASC)
      return [...collections].sort((a, b) => a.volumeValue - b.volumeValue);
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

  // Компонент скелетона для карточки статистики
  const StatsCardSkeleton = () => (
    <div className="bg-white rounded-2xl p-4 relative animate-pulse">
      <div className="absolute top-4 right-4 flex bg-gray-100 rounded-lg p-1">
        <div className="w-8 h-6 bg-gray-200 rounded"></div>
        <div className="w-8 h-6 bg-gray-200 rounded"></div>
      </div>
      
      <div className="mb-5 text-left">
        <div className="flex items-center gap-3 mb-1 -ml-2">
          <div className="flex items-center rounded-lg px-2 py-1">
            <div className="w-3 h-3 bg-gray-200 rounded mr-1"></div>
            <div className="w-16 h-6 bg-gray-200 rounded"></div>
            <div className="w-12 h-4 bg-gray-200 rounded ml-2"></div>
          </div>
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

  // Компонент скелетона для списка коллекций
  const CollectionListSkeleton = () => (
    <div className="space-y-1 px-8">
      {[...Array(8)].map((_, index) => (
        <div key={index} className="flex items-center justify-between py-3 animate-pulse">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-gray-200 rounded-full mr-3"></div>
            <div>
              <div className="w-24 h-4 bg-gray-200 rounded mb-2"></div>
              <div className="w-16 h-3 bg-gray-200 rounded"></div>
            </div>
          </div>
          <div className="text-right">
            <div className="w-20 h-4 bg-gray-200 rounded mb-2"></div>
            <div className="w-12 h-3 bg-gray-200 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );

  // Показываем загрузку во время инициализации
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
            <StatsCardSkeleton />
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
                {[...Array(4)].map((_, index) => (
                  <div key={index} className="flex items-center gap-1">
                    <div className="w-1 h-1 bg-gray-200 rounded-full"></div>
                    <div className="w-8 h-3 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Collections List Skeleton */}
          <CollectionListSkeleton />
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
            <span className="text-gray-700 font-bold text-sm">
              @{getUsername() || 'user'} • {userTotalValue.toFixed(2)} TON • 
            </span>
            <span className="text-orange-500 font-bold text-sm">🎁 {userTotalGifts}</span>
          </div>
        </div>

        {/* Chart Container with Time Frame Buttons */}
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

            {/* Volume & Orders Display */}
            <div className="mb-5 text-left">
              <div className="flex items-center gap-3 mb-1 -ml-2">
                <div className="flex items-center rounded-lg px-2 py-1">
                  <span className="text-blue-500 text-xs mr-1">■</span>
                  <span className="text-lg font-mono font-bold text-blue-500 tracking-wide">
                    {activeCurrency === 'USDT' && '$'}
                    {volumeStats.currentVolume}
                  </span>
                  <span className="text-gray-500 text-xs ml-2">Volume</span>
                </div>
                <div className="flex items-center rounded-lg px-2 py-1">
                  <span className="text-green-500 text-xs mr-1">●</span>
                  <span className="text-lg font-mono font-bold text-green-500 tracking-wide">
                    {volumeStats.currentOrders}
                  </span>
                  <span className="text-gray-500 text-xs ml-2">Purchases</span>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="w-full h-52 mb-1 relative"> {/* увеличена высота с h-40 до h-52 */}
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
                <ComposedChart data={volumeChartData} margin={{ left: -10, right: 0 }} barCategoryGap="10%">
                  <XAxis hide />
                  <YAxis 
                    yAxisId="turnover"
                    orientation="left"
                    hide={false}
                    type="number" 
                    domain={[0, (dataMax) => Math.max(dataMax * 1.15, dataMax + 10000)]} // минимум 0, максимум с запасом
                    minTickGap={10}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    tickMargin={5}
                    width={45}
                    tickFormatter={(value) => {
                      if (value >= 1000000) {
                        return `${(value / 1000000).toFixed(1)}M`;
                      } else if (value >= 1000) {
                        return `${(value / 1000).toFixed(0)}K`;
                      }
                      return value?.toFixed(0);
                    }}
                  />
                  <YAxis 
                    yAxisId="purchases"
                    orientation="right"
                    hide
                    domain={[0, (dataMax) => Math.max(dataMax * 1.15, dataMax + 10)]}
                  />
                  <CartesianGrid 
                    horizontal={true} 
                    vertical={false} 
                    stroke="#e5e7eb" 
                    strokeWidth={0.5}
                    strokeOpacity={0.8}
                  />
                  <Tooltip 
                    content={<CustomTooltip />} 
                    animationDuration={150}
                  />
                  <Bar
                    yAxisId="turnover"
                    dataKey="totalTurnover"
                    fill="#3b82f6"
                    opacity={0.7}
                    radius={[1, 1, 0, 0]}
                    animationDuration={300}
                  />
                  <Line
                    yAxisId="purchases"
                    type="monotone"
                    dataKey="totalPurchases"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    animationDuration={300}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Date markers (bottom) */}
            <div className="flex justify-between text-xs text-gray-400 px-4 mb-3 mt-2">
              {volumeChartData.filter((_, index) => index % Math.ceil(volumeChartData.length / 4) === 0).map((item, index) => (
                <span key={index} className="text-xs">{item.time}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 mb-4">
          <div className="flex mb-4 gap-2 justify-between">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  if (tab === 'My Gifts') {
                    navigate('/');
                  } else if (tab === 'Market Cap') {
                    navigate('/market');
                  } else if (tab === 'Volume') {
                    navigate('/volume');
                  } else if (tab === 'Gainers') {
                    navigate('/gainers');
                  } else {
                    setActiveTab(tab);
                  }
                }}
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
            {/* Вернули фильтр UP/DOWN */}
            <div className="flex items-center gap-2">
              <div className={`w-1 h-1 rounded-full ${
                activeFilter === 'UP' ? 'bg-blue-500' : 'bg-gray-300'
              }`} />
              <button
                onClick={() => setActiveFilter('UP')}
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
                onClick={() => setActiveFilter('DOWN')}
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
          {visibleCollections.map((collection) => (
            <div 
              key={collection.id} 
              className="flex items-center justify-between py-3 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
              onClick={() => handleCollectionClick(collection)}
            >
              <div className="flex items-center">
                <div className="w-10 h-10 flex items-center justify-center mr-3 overflow-hidden">
                  {collection.icon?.startsWith('http') ? (
                    <img 
                      src={collection.icon} 
                      alt={collection.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : (
                    <span className="text-lg">{collection.icon || '🎁'}</span>
                  )}
                  <div className="w-full h-full items-center justify-center text-lg hidden">
                    🎁
                  </div>
                </div>
                <div>
                  <div className="font-medium text-gray-900">{collection.name}</div>
                  <div className="text-sm text-gray-500">{formatNumberWithSpaces(collection.orders)} Purchases</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium text-gray-900 flex items-center">
                  {activeCurrency === 'TON' ? (
                    <>{formatNumberWithSpaces(collection.volume)} <TonIcon className="w-6 h-6 -mt-1" /></>
                  ) : (
                    `$${formatNumberWithSpaces(collection.volume * currentTonPrice)}`
                  )}
                </div>
                <div className={`text-sm ${collection.isNegative ? 'text-red-500' : 'text-green-500'}`}>
                  {collection.change}
                </div>
              </div>
            </div>
          ))}
          
          {/* Loading indicator */}
          {loadingMore && (
            <div className="flex justify-center py-4">
              <div className="text-gray-500 text-sm">Loading more collections...</div>
            </div>
          )}
        </div>
      </div>
      
      {/* Popup with chart */}
      {/* <CollectionPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        collection={selectedCollection}
        chartData={selectedCollection ? getChartDataForCollection(selectedCollection) : []}
        currentTonPrice={currentTonPrice}
        section="Volume"
      /> */}
      <VolumePopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        collection={selectedCollection}
        chartData={selectedCollection ? getChartDataForCollection(selectedCollection) : []}
        currentTonPrice={currentTonPrice}
        initialCurrency={activeCurrency} // передаем только для инициализации
        volumeChange={selectedCollection ? getVolumeChangeForCollection(selectedCollection) : 0}
        // убираем onCurrencyChange и activeCurrency
      />
    </div>
  );
};

export default VolumePage;
