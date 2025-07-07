import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { FaDollarSign } from 'react-icons/fa';
import { FiTrendingUp, FiTrendingDown } from 'react-icons/fi';
import GiftIndexLogo from '../assets/Giftindex_logo.svg';
import { trackMarketCapPageView, trackMarketCapCollectionClick } from '../utils/metrics';
import CollectionPopup from '../components/CollectionPopup';
import { useTelegram } from '../hooks/useTelegram';
import { fetchMarketCapData } from '../utils/api';
import { processUserGifts } from '../utils/api';

// Function for number formatting with spaces - moved to module level
const formatNumberWithSpaces = (num) => {
  // Форматирование с тонкими неразрывными пробелами как разделителями тысяч
  const rounded = Math.round(num);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
};

// Function for number formatting with double spaces for main Market Cap
const formatNumberWithDoubleSpaces = (num) => {
  // Форматирование с тонкими неразрывными пробелами как разделителями тысяч для основного Market Cap
  const rounded = Math.round(num);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
};

// Компонент иконки TON
const TonIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className={className}>
    <path fill="#08C" d="M19.011 9.201L12.66 19.316a.857.857 0 0 1-1.453-.005L4.98 9.197a1.8 1.8 0 0 1-.266-.943a1.856 1.856 0 0 1 1.881-1.826h10.817c1.033 0 1.873.815 1.873 1.822c0 .334-.094.664-.274.951M6.51 8.863l4.632 7.144V8.143H6.994c-.48 0-.694.317-.484.72m6.347 7.144l4.633-7.144c.214-.403-.005-.72-.485-.720h-4.148z"/>
  </svg>
);

const token = {
  name: 'TEST • 1337 TON',
  symbol: '🎁 34',

};

const tabs = ['My Gifts', 'Market Cap', 'Volume', 'Gainers'];

const MarketPage = () => {
  const { isAuthenticated, user, getUsername, getUserPhoto, isInitializing } = useTelegram();
  const [activeTab, setActiveTab] = useState('Market Cap');
  const [activeCurrency, setActiveCurrency] = useState('TON');
  const [activeFilter, setActiveFilter] = useState('FLOOR');
  const [popupOpen, setPopupOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTonPrice, setCurrentTonPrice] = useState(3.0);
  const [marketData, setMarketData] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true); // Новое состояние для скелетона
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

  // Функция для безопасного форматирования числа
  const safeToFixed = (value, decimals = 2, fallback = '0') => {
    const num = Number(value);
    return isNaN(num) ? fallback : num.toFixed(decimals);
  };

  // Функция для получения исторических данных коллекции для графика
  const getChartDataForCollection = (collection) => {
    if (!marketData || !marketData.data) return [];
    
    // Фильтруем данные по collection_id выбранной коллекции и сортируем по дате
    const collectionData = marketData.data
      .filter(item => item.collection_id === collection.id)
      .sort((a, b) => new Date(a.dt) - new Date(b.dt));

    // Добавляем dayChange для каждой точки (по floor_price и median_price)
    const chartData = collectionData.map((item, idx, arr) => {
      // Для первой точки сравниваем с prev_day_*, для остальных с предыдущей в массиве
      let prevFloor = idx === 0
        ? Number(item.prev_day_floor_price)
        : Number(arr[idx - 1].floor_price);
      let prevMedian = idx === 0
        ? Number(item.prev_day_median_price)
        : Number(arr[idx - 1].median_price);

      const floor = Number(item.floor_price);
      const median = Number(item.median_price);

      // dayChange для floor и median
      const floorDayChange = prevFloor && prevFloor !== 0 ? ((floor - prevFloor) / prevFloor) * 100 : 0;
      const medianDayChange = prevMedian && prevMedian !== 0 ? ((median - prevMedian) / prevMedian) * 100 : 0;

      return {
        dt: item.dt,
        floor_price: Math.round(floor),
        median_price: Math.round(median),
        volume: Math.round(Number(item.volume || item.turnover)),
        orders: Math.round(Number(item.orders || item.purchases)),
        // dayChange для попапа: зависит от фильтра, но передаем оба
        floorDayChange,
        medianDayChange,
        // Для совместимости с попапом (универсальное поле)
        dayChange: activeFilter === 'FLOOR' ? floorDayChange : medianDayChange,
      };
    });

    return chartData.length > 0
      ? chartData
      : [
          { dt: new Date().toISOString(), floor_price: 2, median_price: 3, volume: 100, orders: 5, floorDayChange: 0, medianDayChange: 0, dayChange: 0 }
        ];
  };

  // Обработчик клика на коллекцию
  const handleCollectionClick = (collection) => {
    setSelectedCollection(collection);
    setPopupOpen(true);
    
    // Отслеживаем клик по коллекции
    trackMarketCapCollectionClick(collection, activeCurrency);
  };

  // Custom tooltip для основного графика с дельтой
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      const value = payload[0]?.value;
      
      return (
        <div className="bg-white px-3 py-2 border border-gray-200 rounded shadow-lg">
          <p className="text-gray-600 font-medium text-xs mb-1">
            {data?.date}
          </p>
          <p className="text-green-600 font-medium text-sm">
            Market Cap: {formatNumberWithSpaces(value)} {activeCurrency === 'TON' ? 'TON' : '$'}
          </p>
          {data?.dayChange !== undefined && (
            <p className={`text-xs font-medium ${data?.dayChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {`Day Change: ${data?.dayChange >= 0 ? '+' : ''}${data?.dayChange?.toFixed(2)}%`}
            </p>
          )}
          {data?.orders !== undefined && (
            <p className="text-blue-600 font-medium text-xs">
              {`Purchases: ${formatNumberWithSpaces(data?.orders)}`}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Загружаем данные MarketCap при монтировании компонента
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

    // Загружаем данные только один раз при первом монтировании
    if (dataLoaded) return;
    
    const loadMarketCapData = async () => {
      try {
        setLoading(true);
        setError(null);
        setShowSkeleton(true);
        
        // Таймаут для предотвращения бесконечной загрузки
        const timeoutId = setTimeout(() => {
          setShowSkeleton(false);
          setLoading(false);
        }, 30000); // 30 секунд максимум
        
        // Используем защищенный BFF endpoint через fetchMarketCapData
        const result = await fetchMarketCapData();
        
        clearTimeout(timeoutId);

        setMarketData(result);
        setCurrentTonPrice(safeNumber(result.ton_price, 3.0));
        setDataLoaded(true);
        setShowSkeleton(false);
        
        // Отслеживаем просмотр страницы с флагом защищенного endpoint
        trackMarketCapPageView(result.data || [], activeCurrency);
        
      } catch (err) {
        setError(err.message);
        // При ошибке продолжаем показывать скелетон
        setShowSkeleton(true);
      } finally {
        setLoading(false);
      }
    };

    loadMarketCapData();
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

  // Мемоизируем тяжелые вычисления с учетом activeFilter
  const marketChartData = useMemo(() => {
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
    const chartData = sortedDates.map((dateKey, index) => {
      const uniqueCollections = Object.values(dataByDate[dateKey]);
      
      // Суммируем по выбранной метрике в зависимости от activeFilter
      const totalMcap = uniqueCollections.reduce((sum, collection) => {
        const mcapValue = activeFilter === 'FLOOR' 
          ? safeNumber(collection.mcap_floor) 
          : safeNumber(collection.mcap_median);
        return sum + mcapValue;
      }, 0);
      
      const totalVolume = uniqueCollections.reduce((sum, collection) => 
        sum + safeNumber(collection.turnover || collection.volume), 0
      );
      const totalOrders = uniqueCollections.reduce((sum, collection) => 
        sum + safeNumber(collection.purchases || collection.orders), 0
      );

      // Вычисляем дневое изменение
      let dayChange = 0;
      if (index > 0) {
        const prevDateKey = sortedDates[index - 1];
        const prevCollections = Object.values(dataByDate[prevDateKey]);
        const prevMcap = prevCollections.reduce((sum, collection) => {
          const mcapValue = activeFilter === 'FLOOR' 
            ? safeNumber(collection.mcap_floor) 
            : safeNumber(collection.mcap_median);
          return sum + mcapValue;
        }, 0);

        if (prevMcap > 0) {
          dayChange = ((totalMcap - prevMcap) / prevMcap) * 100;
        }
      }

      return {
        date: dateKey,
        totalMcap: totalMcap,
        totalVolume: totalVolume,
        totalOrders: totalOrders,
        collectionsCount: uniqueCollections.length,
        dayChange: dayChange
      };
    })
    .map((item) => ({
      value: activeCurrency === 'TON' ? item.totalMcap : item.totalMcap * currentTonPrice,
      time: new Date(item.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
      date: new Date(item.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
      volume: item.totalVolume,
      orders: item.totalOrders,
      collectionsCount: item.collectionsCount,
      dayChange: item.dayChange,
      dateKey: item.date
    }));

    return chartData.length > 0 ? chartData : [];
  }, [marketData, activeCurrency, currentTonPrice, activeFilter]);

  // Обновляем данные коллекций с дополнительными полями из TestPage.jsx
  useEffect(() => {
    if (!dataLoaded || !marketData) return;
    
    // Получаем только уникальные коллекции
    const uniqueCollections = getUniqueCollections(marketData.data);
    
    // Преобразуем данные для отображения с дополнительными полями
    const transformedCollections = uniqueCollections.map((item) => {
      // Вычисляем процентные изменения для всех метрик с безопасными проверками
      const floorChange = calculatePercentChange(
        safeNumber(item.floor_price), 
        safeNumber(item.prev_day_floor_price)
      );
      const mcapMedianChange = calculatePercentChange(
        safeNumber(item.mcap_median), 
        safeNumber(item.prev_day_mcap_median)
      );
      const mcapFloorChange = calculatePercentChange(
        safeNumber(item.mcap_floor), 
        safeNumber(item.prev_day_mcap_floor)
      );
      const avgPriceChange = calculatePercentChange(
        safeNumber(item.avg_price), 
        safeNumber(item.prev_day_avg_price)
      );
      const medianPriceChange = calculatePercentChange(
        safeNumber(item.median_price), 
        safeNumber(item.prev_day_median_price)
      );
      const giftsCountChange = calculatePercentChange(
        safeNumber(item.gifts_count), 
        safeNumber(item.prev_day_gifts_count)
      );

      // Определяем значения для FLOOR и MARKET фильтра с безопасными проверками (округляем до целых)
      const mcapFloorTON = Math.round(safeNumber(item.mcap_floor));
      const mcapMedianTON = Math.round(safeNumber(item.mcap_median));
      const mcapFloorUSD = Math.round(mcapFloorTON * currentTonPrice);
      const mcapMedianUSD = Math.round(mcapMedianTON * currentTonPrice);

      // Используем mcap_floor для FLOOR фильтра и mcap_median для MARKET фильтра
      const mcapInTON = activeFilter === 'FLOOR' ? mcapFloorTON : mcapMedianTON;
      const mcapInUSD = activeFilter === 'FLOOR' ? mcapFloorUSD : mcapMedianUSD;
      const mcapChangePercent = activeFilter === 'FLOOR' ? mcapFloorChange : mcapMedianChange;
      
      // Используем реальный floor price или median price из API с безопасной проверкой (округляем до целых)
      const floorOrMedianPriceTON = activeFilter === 'MARKET'
        ? Math.round(safeNumber(item.median_price))
        : Math.round(safeNumber(item.floor_price));
      const floorOrMedianPriceUSD = Math.round(floorOrMedianPriceTON * currentTonPrice);

      // Основной dayChange для коллекции - ВСЕГДА основан на mcap изменениях для основного экрана
      const dayChange = activeFilter === 'FLOOR' ? mcapFloorChange : mcapMedianChange;

      return {
        id: item.collection_id || `${item.slug}-${Date.now()}`,
        name: item.slug || 'Unknown Collection',
        priceTON: mcapInTON.toString(),
        priceUSD: mcapInUSD.toString(),
        change: `${mcapChangePercent >= 0 ? '+' : ''}${safeToFixed(mcapChangePercent, 1)}%`,
        // Удаляем $ из начала строки, оставляем только форматирование K/M
        mcap: mcapInUSD >= 1000000 ? `${(mcapInUSD / 1000000).toFixed(1)}M` : `${Math.round(mcapInUSD / 1000)}K`,
        mcapTON: mcapInTON >= 1000000 ? `${(mcapInTON / 1000000).toFixed(1)}M TON` : `${Math.round(mcapInTON / 1000)}K TON`,
        // floorTON и floorUSD теперь зависят от фильтра (floor_price или median_price)
        floorTON: `${formatNumberWithSpaces(floorOrMedianPriceTON)} TON`,
        floorUSD: `$${formatNumberWithSpaces(floorOrMedianPriceUSD)}`,
        icon: item.png || '',
        volume: Math.round(safeNumber(item.turnover || item.volume)),
        orders: Math.round(safeNumber(item.purchases || item.orders)),
        gifts: Math.round(safeNumber(item.gifts_count || item.gifts)),
        date: item.dt || new Date().toISOString(),
        mcapValue: mcapInTON,
        // Для попапа оставим оба значения (floor и median) для гибкости
        floorPriceTON: Math.round(safeNumber(item.floor_price)).toString(),
        floorPriceUSD: Math.round(safeNumber(item.floor_price) * currentTonPrice).toString(),
        medianPriceTON: Math.round(safeNumber(item.median_price)).toString(),
        medianPriceUSD: Math.round(safeNumber(item.median_price) * currentTonPrice).toString(),
        isNegative: mcapChangePercent < 0,

        // Дополнительные поля из TestPage.jsx с безопасными проверками (целые числа)
        mcap_median: Math.round(safeNumber(item.mcap_median)),
        mcap_floor: Math.round(safeNumber(item.mcap_floor)),
        avg_price: Math.round(safeNumber(item.avg_price)),
        median_price: Math.round(safeNumber(item.median_price)),
        gifts_count: Math.round(safeNumber(item.gifts_count)),
        turnover: Math.round(safeNumber(item.turnover)),
        purchases: Math.round(safeNumber(item.purchases)),

        // Процентные изменения ЦЕН для попапа
        floor_price_day_change: floorChange,
        median_price_day_change: medianPriceChange,
        
        // Процентные изменения MCAP для основного экрана
        mcap_median_day_change: mcapMedianChange,
        mcap_floor_day_change: mcapFloorChange,
        avg_price_day_change: avgPriceChange,
        gifts_count_day_change: giftsCountChange,

        // Предыдущие значения для попапа (округляем до целых)
        prev_day_floor_price: Math.round(safeNumber(item.prev_day_floor_price)),
        prev_day_median_price: Math.round(safeNumber(item.prev_day_median_price)),
        prev_day_mcap_median: Math.round(safeNumber(item.prev_day_mcap_median)),
        prev_day_mcap_floor: Math.round(safeNumber(item.prev_day_mcap_floor)),
        prev_day_avg_price: Math.round(safeNumber(item.prev_day_avg_price)),
        prev_day_gifts_count: Math.round(safeNumber(item.prev_day_gifts_count)),
        prev_day_purchases: Math.round(safeNumber(item.prev_day_purchases)),
        prev_day_turnover: Math.round(safeNumber(item.prev_day_turnover)),

        // dayChange для основного экрана - ВСЕГДА mcap изменения
        dayChange: dayChange,
      };
    });
    
    // Сортируем по market cap (убывание)
    transformedCollections.sort((a, b) => safeNumber(b.mcapValue) - safeNumber(a.mcapValue));
    
    setCollections(transformedCollections);
  }, [activeCurrency, currentTonPrice, dataLoaded, marketData, activeFilter]);

  // Обновляем marketStats с учетом фильтра и безопасными проверками
  const marketStats = useMemo(() => {
    if (!marketData || !marketData.data) {
      return {
        totalMcap: '279.0K',
        totalVolume: '53212',
        totalOrders: 39,
        change: '+279.0%',
        priceValue: activeCurrency === 'TON' ? '4734.8' : '14204.3',
        deltaPercent: 0
      };
    }

    const formatValue = (val, currency = '') => {
      const value = safeNumber(val);
      if (value >= 1000000) {
        return `${safeToFixed(value / 1000000, 1)}M${currency ? ' ' + currency : ''}`;
      } else if (value >= 1000) {
        return `${safeToFixed(value / 1000, 0)}K${currency ? ' ' + currency : ''}`;
      }
      return `${Math.round(value)}${currency ? ' ' + currency : ''}`;
    };

    const latestCollections = getLatestCollectionsBySlug(marketData.data);

    // Суммируем сегодняшние значения по выбранной метрике (FLOOR или MARKET)
    const todayMcap = latestCollections.reduce((sum, item) => {
      const mcapValue = activeFilter === 'FLOOR' 
        ? safeNumber(item.mcap_floor) 
        : safeNumber(item.mcap_median);
      return sum + mcapValue;
    }, 0);

    // Суммируем вчерашние значения по выбранной метрике из prev_day_* полей
    const yesterdayMcap = latestCollections.reduce((sum, item) => {
      const prevMcapValue = activeFilter === 'FLOOR' 
        ? safeNumber(item.prev_day_mcap_floor) 
        : safeNumber(item.prev_day_mcap_median);
      return sum + prevMcapValue;
    }, 0);

    // --- Добавлено: вычисление и логирование total floor и median mcap ---
    const todayMcapFloor = latestCollections.reduce((sum, item) => sum + safeNumber(item.mcap_floor), 0);
    const yesterdayMcapFloor = latestCollections.reduce((sum, item) => sum + safeNumber(item.prev_day_mcap_floor), 0);
    const todayMcapMedian = latestCollections.reduce((sum, item) => sum + safeNumber(item.mcap_median), 0);
    const yesterdayMcapMedian = latestCollections.reduce((sum, item) => sum + safeNumber(item.prev_day_mcap_median), 0);

    const floorDeltaPercent = yesterdayMcapFloor > 0 ? ((todayMcapFloor - yesterdayMcapFloor) / yesterdayMcapFloor) * 100 : 0;
    const medianDeltaPercent = yesterdayMcapMedian > 0 ? ((todayMcapMedian - yesterdayMcapMedian) / yesterdayMcapMedian) * 100 : 0;

    const todayVolume = latestCollections.reduce((sum, item) => 
      sum + safeNumber(item.turnover || item.volume), 0
    );
    const todayOrders = latestCollections.reduce((sum, item) => 
      sum + safeNumber(item.purchases || item.orders), 0
    );

    // Вычисляем процентное изменение
    let deltaPercent = 0;
    if (yesterdayMcap > 0) {
      deltaPercent = ((todayMcap - yesterdayMcap) / yesterdayMcap) * 100;
    }

    return {
      totalMcap: activeCurrency === 'TON'
        ? formatNumberWithDoubleSpaces(Math.round(todayMcap))
        : formatNumberWithDoubleSpaces(Math.round(todayMcap * currentTonPrice)),
      totalVolume: activeCurrency === 'TON'
        ? formatNumberWithDoubleSpaces(Math.round(todayVolume))
        : '$' + formatValue(todayVolume * currentTonPrice),
      totalOrders: Math.round(todayOrders).toString(),
      change: `${deltaPercent >= 0 ? '+' : ''}${safeToFixed(deltaPercent, 1)}%`,
      priceValue: activeCurrency === 'TON'
        ? formatNumberWithDoubleSpaces(Math.round(todayMcap))
        : formatNumberWithDoubleSpaces(Math.round(todayMcap * currentTonPrice)),
      deltaPercent: deltaPercent,
      yesterdayMcap: yesterdayMcap,
      todayMcap: todayMcap,
    };
  }, [marketData, activeCurrency, currentTonPrice, marketChartData, activeFilter]);

  // Возвращает последние (по дате) записи для каждого slug
  function getLatestCollectionsBySlug(data) {
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
  }

  // Мемоизируем видимые коллекции
  const visibleCollections = useMemo(() => {
    return collections.slice(0, visibleCount);
  }, [collections, visibleCount]);

  // Функция для загрузки дополнительных коллекций
  const loadMoreCollections = async () => {
    if (loadingMore || visibleCount >= collections.length) return;
    
    setLoadingMore(true);
    // Имитируем задержку загрузки
    await new Promise(resolve => setTimeout(resolve, 500));
    setVisibleCount(prev => Math.min(prev + 12, collections.length));
    setLoadingMore(false);
  };

  // Добавляем проверку есть ли еще коллекции для загрузки
  const hasMoreCollections = useMemo(() => {
    return visibleCount < collections.length;
  }, [visibleCount, collections.length]);

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
          setVisibleCount(prev => Math.min(prev + 12, collections.length));
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

  // Хелпер для рендера числа с группами по 3 цифры, каждая группа в отдельном <span>
  const renderNumberWithSpans = (numberStr) => {
    // Убираем все нецифры (например, $ или пробелы)
    const clean = numberStr.replace(/[^\d.]/g, '');
    const [intPart, fracPart] = clean.split('.');
    // Группируем по 3 цифры с конца
    const groups = [];
    for (let i = intPart.length; i > 0; i -= 3) {
      const start = Math.max(0, i - 3);
      groups.unshift(intPart.slice(start, i));
    }
    return (
      <>
        {groups.map((group, idx) => (
          <React.Fragment key={idx}>
            <span className="font-bold">{group}</span>
            {idx !== groups.length - 1 && (
              <span style={{ fontSize: 'inherit', lineHeight: 1 }}>{'\u202F'}</span>
            )}
          </React.Fragment>
        ))}
        {fracPart && (
          <span className="font-bold" style={{ fontSize: '0.9em' }}>.{fracPart}</span>
        )}
      </>
    );
  };

  // Компонент скелетона для карточки маркет капитализации
  const MarketCapCardSkeleton = () => (
    <div className="bg-white rounded-2xl p-4 relative animate-pulse">
      <div className="absolute top-4 right-2 flex bg-gray-100 rounded-lg p-1">
        <div className="w-8 h-6 bg-gray-200 rounded"></div>
        <div className="w-8 h-6 bg-gray-200 rounded"></div>
      </div>
      
      <div className="mb-3 text-left">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg px-3 py-1 gap-3">
            <div className="w-5 h-5 bg-gray-200 rounded"></div>
            <div className="w-24 h-8 bg-gray-200 rounded"></div>
            <div className="w-16 h-6 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>

      <div className="w-full h-56 mb-3 relative bg-gray-100 rounded"></div>

      <div className="flex justify-between text-xs text-gray-500 px-4 mt-2 font-medium">
        {[...Array(5)].map((_, index) => (
          <div key={index} className="w-8 h-3 bg-gray-200 rounded"></div>
        ))}
      </div>
    </div>
  );

  // Компонент скелетона для списка коллекций
  const MarketCollectionListSkeleton = () => (
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

  // Показываем скелетон при загрузке или ошибке
  if (loading || showSkeleton || error || isInitializing) {
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
          <div className="px-1 -mt-3">
            <MarketCapCardSkeleton />
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
                    <div className="w-12 h-3 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Collections List Skeleton */}
          <MarketCollectionListSkeleton />
        </div>
      </div>
    );
  }

  // Показываем состояние когда нет данных но загрузка завершена
  if (!marketData || !collections.length) {
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
          <div className="px-1 -mt-3">
            <MarketCapCardSkeleton />
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
                    <div className="w-12 h-3 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Collections List */}
          <MarketCollectionListSkeleton />
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
        <div className="px-1 -mt-3">
          <div className="bg-white rounded-2xl p-4 relative">
            
            {/* Currency Switch */}
            <div className="absolute top-4 right-2 flex bg-gray-100 rounded-lg p-1 z-20">
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
                className={`flex items-center  justify-center w-8 h-6 rounded transition-all duration-200 ${
                  activeCurrency === 'USDT'
                    ? 'bg-white text-green-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <FaDollarSign className="w-3 h-3" />
              </button>
            </div>

            {/* Price Display */}
            <div className="mb-3 text-left" style={{ marginLeft: '-5.5px' }}>
              <div className="flex items-center gap-2 ">
                <div className="flex items-center rounded-lg px-3 py-1 gap-3">
                  {/* Стрелка тренда перед ценой */}
                  <span className="flex items-center -mt-2 gap-1">
                    {marketStats.change.startsWith('+') ? (
                      <FiTrendingUp className="w-5 h-5 text-green-500 -mt-0.5" />
                    ) : (
                      <FiTrendingDown className="w-5 h-5 text-red-500 mt-1" />
                    )}
                  </span>
                  {/* Цена и валютный знак в одном контейнере для USDT */}
                  <span className="flex items-center">
                    {activeCurrency === 'USDT' ? (
                      <>
                        <span className={`text-2xl font-mono font-bold tracking-wide ${marketStats.change.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>$</span>
                        <span className={`flex items-baseline font-mono font-bold tracking-wide text-2xl ${marketStats.change.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                          {renderNumberWithSpans(marketStats.priceValue)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={`flex items-baseline font-mono font-bold tracking-wide text-2xl ${marketStats.change.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                          {renderNumberWithSpans(marketStats.priceValue)}
                        </span>
                        {activeCurrency === 'TON' && (
                          <TonIcon className="w-7 h-7  text-gray-500 transform -mt-2" />
                        )}
                      </>
                    )}
                  </span>
                  {/* Процент изменения справа от цены */}
                  <span className={`flex items-center gap-1`}>
                    <span
                      className={`text-xs font-bold ${
                        marketStats.change.startsWith('+')
                          ? 'text-green-500 bg-green-100 rounded-lg px-2 py-1'
                          : 'text-red-500 bg-red-100 rounded-lg px-2 py-1'
                      } -ml-0.5`}
                    >
                      {marketStats.change}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="w-full h-56 mb-3 relative">
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
                <AreaChart data={marketChartData} margin={{ left: 5, right: 5, top: 15, bottom: 15 }}>
                  <defs>
                    {/* Градиент зависит от направления тренда */}
                    <linearGradient id="marketCapGradient" x1="0" y1="0" x2="0" y2="1">
                      {marketStats.change.startsWith('+') ? (
                        <>
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="75%" stopColor="#10b981" stopOpacity={0.05} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </>
                      ) : (
                        <>
                          <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                          <stop offset="75%" stopColor="#ef4444" stopOpacity={0.05} />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                        </>
                      )}
                    </linearGradient>
                  </defs>
                  <XAxis 
                    hide 
                    dataKey="time"
                  />
                  <YAxis 
                    hide={false}
                    type="number" 
                    domain={['dataMin * 0.95', 'dataMax * 1.05']}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    tickMargin={5}
                    width={45}
                    tickFormatter={(value) => {
                      // Форматируем значения оси Y в K/M
                      if (value >= 1000000) {
                        return `${(value / 1000000).toFixed(1)}M`;
                      } else if (value >= 1000) {
                        return `${(value / 1000).toFixed(0)}K`;
                      }
                      return value?.toFixed(0);
                    }}
                  />
                  <CartesianGrid 
                    horizontal={true} 
                    vertical={false} 
                    stroke="#e5e7eb" 
                    strokeWidth={0.5}
                    strokeOpacity={0.8}
                    strokeDasharray="4 4"
                  />
                  <Tooltip 
                    content={<CustomTooltip />} 
                    animationDuration={150}
                    cursor={{ stroke: marketStats.change.startsWith('+') ? '#10b981' : '#ef4444', strokeWidth: 1, strokeDasharray: '5 5' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={marketStats.change.startsWith('+') ? "#10b981" : "#ef4444"}
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#marketCapGradient)"
                    dot={false}
                    activeDot={{ 
                      r: 6, 
                      fill: marketStats.change.startsWith('+') ? "#10b981" : "#ef4444", 
                      stroke: "#ffffff", 
                      strokeWidth: 2,
                      className: "drop-shadow-md"
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Date markers (bottom) - используем реальные данные */}
            <div className="flex justify-between text-xs text-gray-500 px-4 mt-2 font-medium">
              {marketChartData.length > 0 && marketChartData.filter((_, index, arr) => {
                // Показываем первый, последний и еще 2-3 промежуточных значения
                const step = Math.max(1, Math.floor(arr.length / 4));
                return index === 0 || index === arr.length - 1 || index % step === 0;
              }).map((item, index) => (
                <span key={index} className="text-xs">{item.time}</span>
              ))}
            </div>
            {/* --- Разделительная линия --- */}
            
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
            <div className="flex items-center gap-2">
              {/* Сначала FLOOR, потом MARKET */}
              <div className={`w-1 h-1 rounded-full ${
                activeFilter === 'FLOOR' ? 'bg-blue-500' : 'bg-gray-300'
              }`} />
              <button
                onClick={() => setActiveFilter('FLOOR')}
                className={`text-xs font-medium transition-colors ${
                  activeFilter === 'FLOOR' ? 'text-blue-500' : 'text-gray-500'
                }`}
                title="Market Cap based on Floor Price"
              >
                FLOOR
              </button>
              <div className={`w-1 h-1 rounded-full ${
                activeFilter === 'MARKET' ? 'bg-blue-500' : 'bg-gray-300'
              }`} />
              <button
                onClick={() => setActiveFilter('MARKET')}
                className={`text-xs font-medium transition-colors ${
                  activeFilter === 'MARKET' ? 'text-blue-500' : 'text-gray-500'
                }`}
                title="Market Cap based on Median Price"
              >
                MARKET
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
                  <div className="text-sm text-gray-500">
                    {/* FLOOR/MARKET подпись: сначала Floor, потом Median */}
                    {activeFilter === 'FLOOR' ? 'Floor' : 'Median'} • {activeCurrency === 'TON' ? collection.floorTON : collection.floorUSD}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium text-gray-900 flex items-center">
                  {activeCurrency === 'TON' ? (
                    <>
                      <span className="flex items-center">
                        {formatNumberWithSpaces(Math.round(safeNumber(collection.priceTON)))}
                        <TonIcon className="w-6 h-6 -mt-1" />
                      </span>
                    </>
                  ) : (
                    <span className="flex items-center">
                      <span>$</span>
                      {formatNumberWithSpaces(Math.round(safeNumber(collection.priceUSD)))}
                    </span>
                  )}
                </div>
                <div
                  className={`text-sm ${
                    parseFloat(collection.change) === 0
                      ? 'text-gray-900'
                      : parseFloat(collection.change) > 0
                        ? 'text-green-500'
                        : 'text-red-500'
                  }`}
                >
                  {parseFloat(collection.change) === 0
                    ? '0.0%'
                    : parseFloat(collection.change) > 0
                      ? `+${Math.abs(parseFloat(collection.change)).toFixed(1)}%`
                      : `-${Math.abs(parseFloat(collection.change)).toFixed(1)}%`}
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
      <CollectionPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        collection={selectedCollection}
        chartData={selectedCollection ? getChartDataForCollection(selectedCollection) : []}
        currentTonPrice={currentTonPrice}
        section="Market Cap"
        activeFilter={activeFilter} // Передаем активный фильтр в попап
        activeCurrency={activeCurrency} // Передаем активную валюту в попап
      />
    </div>
  );
};

export default MarketPage;