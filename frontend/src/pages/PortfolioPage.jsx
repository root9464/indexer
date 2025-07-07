import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart
} from 'recharts';
import { useTelegram } from '../hooks/useTelegram';
import { processUserGifts } from '../utils/api';
import { openTelegramSettings, openTelegramSettingsAlternative } from '../utils/telegram';
import GiftIndexLogo from '../assets/Giftindex_logo.svg';
import SubscriptionRequiredPage from '../components/SubscriptionRequiredPage';
import { trackPortfolioPageView, trackGiftClick, trackButtonClick } from '../utils/metrics';


// Компонент скелетона для карточки подарка
const GiftCardSkeleton = () => (
  <div className="relative bg-gray-100 rounded-xl overflow-hidden shadow-sm aspect-square animate-pulse">
    {/* Диагональная полоска скелетон */}
    <div className="absolute top-0 right-0 z-20">
      <div
        className="w-[120px] h-[17px] bg-gray-200 flex items-center justify-center"
        style={{
          transform: 'rotate(45deg) translate(18px, -18px)',
        }}
      >
        <div className="w-8 h-2 bg-gray-300 rounded" style={{ marginLeft: '35px' }}></div>
      </div>
    </div>
    
    {/* Основная часть карточки */}
    <div className="w-full h-full relative">
      <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300">
        {/* Иконка скелетон */}
        <div className="w-16 h-16 bg-gray-200 rounded-lg animate-pulse relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
        </div>
      </div>
      
      {/* Цена внизу карточки */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 pt-6 flex items-center justify-center gap-1 bg-gradient-to-t from-gray-400 to-transparent">
        <div className="w-3 h-3 bg-gray-200 rounded"></div>
        <div className="w-8 h-3 bg-gray-200 rounded"></div>
      </div>
    </div>
  </div>
);

// Компонент прогресс бара для PortfolioPage
const PortfolioProgressBar = ({ progress = 0 }) => (
  <div className="w-full bg-gray-200 rounded-full h-1.5 mb-6 mx-4" style={{ width: 'calc(100% - 2rem)' }}>
    <div 
      className="bg-gradient-to-r from-blue-500 to-purple-500 h-1.5 rounded-full transition-all duration-500 ease-out"
      style={{ width: `${progress}%` }}
    ></div>
  </div>
);

// Компонент полного скелетона для PortfolioPage
const PortfolioPageSkeleton = ({ loadingProgress }) => (
  <div className="min-h-screen bg-white flex flex-col items-center">
    <div className="w-full max-w-lg">
      {/* User Info Header Skeleton */}
      <div className="flex justify-center py-4">
        <div className="inline-flex items-center border border-gray-200 rounded-2xl px-3 py-2 bg-gray-50 shadow-sm animate-pulse">
          <div className="w-5 h-5 bg-gray-200 rounded-full mr-2"></div>
          <div className="bg-gray-200 rounded h-4 w-40"></div>
        </div>
      </div>

      {/* Progress Bar */}
      <PortfolioProgressBar progress={loadingProgress} />

      <div className="px-4 pb-20">
        {/* Title with Sort Skeleton */}
        <div className="flex items-center justify-between mb-4">
          <div className="bg-gray-200 rounded h-3 w-20 animate-pulse"></div>
          <div className="bg-gray-200 rounded h-3 w-16 animate-pulse"></div>
        </div>
        
        {/* Gift grid skeleton - увеличенный */}
        <div className="grid grid-cols-3 gap-3">
          {[...Array(18)].map((_, index) => (
            <GiftCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  </div>
);

const PopupGiftChart = ({ open, onClose, gift, chartData, backdrops, currentTonPrice = 3.0 }) => {
  // Function to get backdrop by name
  const getBackdropByName = (backdropName) => {
    return backdrops.find(b => b.name === backdropName) || backdrops[0];
  };

  // Function for date formatting
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const priceChange = chartData.length > 1 ? 
        ((data.median_price - chartData[0].median_price) / chartData[0].median_price * 100) : 0;
      
      return (
        <div className="bg-white px-3 py-2 border border-gray-200 rounded-lg shadow-xl">
          <p className="text-gray-600 text-xs mb-1">{formatDate(data.dt)}</p>
          <p className="text-gray-800 font-bold text-sm">{`${data.median_price.toFixed(2)} TON`}</p>
          <p className="text-gray-600 text-xs">${(data.median_price * currentTonPrice).toFixed(2)}</p>
          <p className={`text-xs font-medium ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom dot on line
  const CustomDot = (props) => {
    const { cx, cy, payload } = props;
    if (!payload) return null;
    
    return (
      <circle 
        cx={cx} 
        cy={cy} 
        r={3} 
        fill="#10b981" 
        stroke="#ffffff" 
        strokeWidth={2}
        className="drop-shadow-sm"
      />
    );
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center transition-all duration-300 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{ background: open ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0)', transition: 'background 0.3s' }}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg bg-white rounded-t-2xl shadow-2xl p-2 pb-8 transition-transform duration-300 ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{
          minHeight: 380,
          marginBottom: '35px',
          marginLeft: 'auto',
          marginRight: 'auto',
          left: 0,
          right: 5,
          maxWidth: '500px'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header and close button */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-lg flex items-center justify-center ml-6"
              style={{
                background: `radial-gradient(circle at 60% 40%, ${getBackdropByName(gift?.backdrop_value)?.hex?.centerColor || '#363738'} 60%, ${getBackdropByName(gift?.backdrop_value)?.hex?.edgeColor || '#0e0f0f'} 100%)`
              }}
            >
              <img
                src={gift?.png}
                alt={gift?.model_value}
                className="w-8 h-8"
              />
            </div>
            <div className="flex-1">
              <div className="font-bold text-base text-gray-800">{gift?.collection} #{gift?.gift_num}</div>
              <div className="text-sm text-gray-500">Model + Backdrop</div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-4xl leading-none p-4">×</button>
        </div>
        
        {/* Chart */}
        <div className="mb-4">
          <div className="text-xs ml-6 text-gray-500 mb-2">Price Dynamic</div>
          <div className="w-full h-48 px-2 ml-1 relative">
            {/* Водяной знак логотипа позади графика */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
              <img
                src={GiftIndexLogo}
                alt="GiftIndex"
                className="w-20 h-auto opacity-20"
                style={{
                  filter: 'grayscale(1) brightness(0.8)'
                }}
              />
            </div>
            
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05}/>
                  </linearGradient>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#059669"/>
                    <stop offset="50%" stopColor="#10b981"/>
                    <stop offset="100%" stopColor="#34d399"/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="dt"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickMargin={8}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                  }}
                />
                <YAxis 
                  domain={['dataMin - 0.1', 'dataMax + 0.1']}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickMargin={8}
                  width={40}
                  tickFormatter={(value) => `${value.toFixed(1)}`}
                />
                <CartesianGrid 
                  horizontal={true} 
                  vertical={false} 
                  stroke="#f3f4f6" 
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="median_price"
                  stroke="url(#lineGradient)"
                  strokeWidth={3}
                  fill="url(#priceGradient)"
                  dot={<CustomDot />}
                  activeDot={{ 
                    r: 5, 
                    fill: "#10b981", 
                    stroke: "#ffffff", 
                    strokeWidth: 3,
                    className: "drop-shadow-lg"
                  }}
                  animationDuration={1000}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Statistics */}
        <div className="grid grid-cols-3 grid-rows-2 gap-x-6 gap-y-2 mt-2 items-center px-6">
          <div>
            <div className="text-xs text-gray-500">Current Price</div>
            <div className="font-bold text-sm text-gray-800">{gift?.median_price?.toFixed(2)} TON</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 whitespace-nowrap">Current Price ($)</div>
            <div className="font-bold text-sm text-gray-800">${(gift?.median_price * currentTonPrice)?.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Gift Count</div>
            <div className="font-bold text-sm text-gray-800">1</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">24h Change</div>
            <div className={`font-bold text-sm ${gift?.per_day_change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {gift?.per_day_change?.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Model</div>
            <div className="font-bold text-sm text-gray-800">{gift?.model_value}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Backdrop</div>
            <div className="font-bold text-sm text-gray-800">{gift?.backdrop_value}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const GiftCard = ({ gift, onClick, backdrop }) => {
  return (
    <div
      className="relative bg-white rounded-xl overflow-hidden shadow-sm aspect-square cursor-pointer"
      onClick={onClick}
    >
      {/* Диагональная полоска с номером */}
      <div className="absolute top-0 right-0 z-20">
        <div
          className="w-[120px] h-[17px] bg-gradient-to-tr from-black to-gray-700 flex items-center justify-center"
          style={{
            transform: 'rotate(45deg) translate(18px, -18px)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
          }}
        >
          <span
            className="text-white text-[10px] font-bold whitespace-nowrap drop-shadow"
            style={{ marginTop: '1px', marginLeft: '35px' }}
          >
            #{gift.gift_num}
          </span>
        </div>
      </div>
      {/* Основная часть карточки */}
      <div className="w-full h-full relative">
        {/* Градиентный фон из backdrop */}
        <div 
          className="relative w-full h-full flex items-center justify-center"
          style={{
            background: `radial-gradient(circle at 60% 40%, ${backdrop?.hex?.centerColor || '#363738'} 60%, ${backdrop?.hex?.edgeColor || '#0e0f0f'} 100%)`
          }}
        >          
          {/* PNG изображение */}
          <img
            src={gift.png}
            alt={gift.model_value}
            className="w-16 h-16 z-20 pointer-events-none"
          />
        </div>
        
        {/* Цена внизу карточки - абсолютное позиционирование */}
        <div 
          className="absolute bottom-0 left-0 right-0 px-2 py-1 pt-6 flex items-center justify-center gap-1"
          style={{
            background: `linear-gradient(to top, ${backdrop?.hex?.edgeColor || '#0e0f0f'}CC, ${backdrop?.hex?.edgeColor || '#0e0f0f'}66, transparent)`
          }}
        >
          <img 
            src="data:image/svg+xml,%3csvg%20width='32'%20height='28'%20viewBox='0 0 32 28' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M31.144 5.84244L17.3468 27.1579C17.1784 27.4166 16.9451 27.6296 16.6686 27.7768C16.3922 27.9241 16.0817 28.0009 15.7664 28C15.451 27.9991 15.141 27.9205 14.8655 27.7716C14.59 27.6227 14.3579 27.4084 14.1911 27.1487L0.664576 5.83477C0.285316 5.23695 0.0852825 4.54843 0.0869241 3.84647C0.104421 2.81116 0.544438 1.82485 1.31047 1.10385C2.0765 0.382844 3.10602 -0.0139909 4.17322 0.000376986H27.6718C29.9143 0.000376986 31.7391 1.71538 31.7391 3.83879C31.7391 4.54199 31.5333 5.23751 31.1424 5.84244M3.98489 5.13003L14.0503 20.1858V3.61156H5.03732C3.99597 3.61156 3.5291 4.28098 3.98647 5.13003M17.7742 20.1858L27.8395 5.13003C28.3032 4.28098 27.8285 3.61156 26.7871 3.61156H17.7742V20.1858Z' fill='white'/%3e%3c/svg%3e" 
            alt="TON" 
            className="w-3 h-3"
          />
          <span className="text-white text-xs font-semibold drop-shadow">
            {gift.median_price?.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};

const PortfolioPage = () => {
  const { user, isAuthenticated, getUsername, getUserPhoto, isInitializing } = useTelegram();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState(null);
  const [portfolioData, setPortfolioData] = useState(null);
  const [backdrops, setBackdrops] = useState([]);
  const [sortDirection, setSortDirection] = useState('desc');
  const [tonPrice, setTonPrice] = useState(3.0);
  const [visibleCount, setVisibleCount] = useState(16);
  const [loadingMore, setLoadingMore] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [selectedGift, setSelectedGift] = useState(null);
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  
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
      }, 300);

      return () => clearInterval(interval);
    } else {
      setLoadingProgress(100);
    }
  }, [loading]);

  // Функция для поиска backdrop - исправляем
  const getBackdropByName = (giftItem) => {
    // Сначала пробуем использовать backdrop объект напрямую из API
    if (giftItem?.backdrop && giftItem.backdrop.hex) {
      return giftItem.backdrop;
    }
    
    // Fallback: ищем по названию в массиве backdrops
    if (giftItem?.backdrop_value && backdrops.length > 0) {
      const backdrop = backdrops.find(b => b.name === giftItem.backdrop_value);
      if (backdrop) return backdrop;
    }
    
    // Default backdrop
    return {
      name: "Default",
      hex: {
        centerColor: "#363738",
        edgeColor: "#0e0f0f"
      }
    };
  };

  useEffect(() => {
    const fetchPortfolioData = async () => {
      // Ждем завершения инициализации
      if (isInitializing) {
        return;
      }

      // Предотвращаем дублирование вызовов
      if (fetchInProgress.current) {
        return;
      }

      if (!isAuthenticated) {
        setError('Not authorized through Telegram');
        setLoading(false);
        return;
      }

      // СТРОГАЯ проверка username перед запросом
      const username = getUsername();
      if (!username || username.trim() === '' || username.startsWith('user_')) {
        setError('Username not found. Please set a username (@username) in your Telegram settings to use this app.');
        setLoading(false);
        return;
      }

      try {
        fetchInProgress.current = true;
        setLoading(true);
        setLoadingProgress(0);
        setError(null);
        setSubscriptionRequired(false);
        
        setLoadingProgress(20);
        
        const data = await processUserGifts();
        setLoadingProgress(60);
        
        if (data.error) {
          // Проверяем специфичные ошибки username
          if (data.error.includes('USERNAME_NOT_OCCUPIED') || data.error.includes('failed to resolve username')) {
            throw new Error('username_not_found');
          }
          throw new Error(data.error);
        }

        // Специальная обработка для пустого портфолио
        if (data.empty_portfolio) {
          setPortfolioData({
            ...data,
            isEmpty: true,
            emptyReason: data.empty_reason || 'no_gifts_found'
          });
          setLoadingProgress(100);
          console.log("📊 Empty portfolio detected - ClickHouse was not queried");
          return;
        }
        
        // Обновляем курс TON если получили его из API
        const currentTonPrice = data.ton_price || 3.0;
        setTonPrice(currentTonPrice);
        
        // Устанавливаем backdrops из API ответа
        if (data.backdrops && Array.isArray(data.backdrops)) {
          setBackdrops(data.backdrops);
        } else {
          setBackdrops([{
            name: "Default",
            hex: {
              centerColor: "#363738", 
              edgeColor: "#0e0f0f"
            }
          }]);
        }
        
        setPortfolioData(data);
        setLoadingProgress(100);
        
      } catch (err) {
        if (err.code === 'SUBSCRIPTION_REQUIRED' || err.message === 'SUBSCRIPTION_REQUIRED') {
          setSubscriptionRequired(true);
          setLoading(false);
          return;
        }
        
        if (err.message === 'username_not_found') {
          setError('Username not found. Please set a username (@username) in your Telegram settings to use this app.');
        } else {
          setError(err.message || 'Failed to load portfolio data');
        }
      } finally {
        setLoading(false);
        fetchInProgress.current = false;
      }
    };

    fetchPortfolioData();
  }, [isAuthenticated, getUsername, isInitializing]);

  // Отслеживаем просмотр страницы портфолио
  useEffect(() => {
    if (!loading && !error && portfolioData && isAuthenticated && !isInitializing) {
      trackPortfolioPageView(portfolioData, getUsername(), user?.id);
    }
  }, [loading, error, portfolioData, isAuthenticated, isInitializing, getUsername, user?.id]);

  // Проверка на пустое портфолио
  if (portfolioData?.isEmpty) {
    const emptyReason = portfolioData.emptyReason;
    
    if (emptyReason === 'privacy_restricted') {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
          <div className="text-center max-w-xs mx-auto p-5 bg-white rounded-2xl shadow-xl border border-gray-100">
            <div className="text-5xl mb-3">🔒</div>
            <h2 className="text-lg font-bold mb-2 text-gray-800">Private Profile</h2>
            <p className="text-gray-600 mb-3 leading-relaxed text-sm">
              This user has restricted access to their gift collection. You can only view your own gifts or public profiles.
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-left">
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <span className="text-blue-500 text-lg">💡</span>
                </div>
                <div className="ml-2 text-left">
                  <h3 className="font-semibold text-blue-800 mb-1 text-xs">Tip:</h3>
                  <p className="text-xs text-blue-700">
                    Ask the user to make their gifts public in Telegram settings, or switch to viewing your own profile.
                  </p>
                </div>
              </div>
            </div>

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

    // Случай no_gifts_found
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="text-center max-w-xs mx-auto p-5 bg-white rounded-2xl shadow-xl border border-gray-100">
          <div className="text-5xl mb-3">🎁</div>
          <h2 className="text-lg font-bold mb-2 text-gray-800">No Gifts Yet</h2>
          <p className="text-gray-600 mb-3 leading-relaxed text-sm">
            This profile doesn't have any Star Gifts yet. Gifts need to be <strong>received and opened</strong> to appear in the collection.
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-left">
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-1">
                <span className="text-blue-500 text-lg">📱</span>
              </div>
              <div className="ml-2">
                <h3 className="font-semibold text-blue-800 mb-1 text-xs">To get gifts visible:</h3>
                <ol className="text-xs text-blue-700 space-y-0.5">
                  <li>1. Receive a Star Gift in Telegram</li>
                  <li>2. <strong>Open the gift</strong> in the chat</li>
                  <li>3. The gift will appear in your profile</li>
                  <li>4. Come back to see your collection!</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200 shadow-lg text-sm"
            >
              Refresh Collection
            </button>
            
            <button
              onClick={() => navigate('/market')}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200 text-sm"
            >
              Explore Market
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-500">@{getUsername() || 'user'}</p>
            <p className="text-xs text-gray-400 mt-1">No gifts in ClickHouse database</p>
          </div>
        </div>
      </div>
    );
  }

  // Защита от undefined данных
  const results = portfolioData?.results || [];

  // Оптимизированный расчет уникальных подарков - группируем по gift_id и берем только последние записи
  const uniqueGifts = results.length > 0 
    ? results.reduce((acc, item) => {
        if (item?.gift_id) {
          const existing = acc[item.gift_id];
          if (!existing || new Date(item.dt) > new Date(existing.dt)) {
            acc[item.gift_id] = item;
          }
        }
        return acc;
      }, {})
    : {};

  const uniqueGiftsArray = Object.values(uniqueGifts);

  // Исправляем расчет общей суммы - используем актуальный курс TON
  const currentTonPrice = portfolioData?.ton_price || tonPrice;
  const totalTON = uniqueGiftsArray.reduce((sum, gift) => sum + (gift?.median_price || 0), 0);
  const totalUSD = totalTON * currentTonPrice;

  // Расчет общей статистики - каждый уникальный подарок считается как 1 единица
  const totalMarketCap = uniqueGiftsArray.reduce((sum, gift) => sum + (gift?.median_price || 0), 0);
  const totalGifts = uniqueGiftsArray.length;
  const totalUniqueGifts = uniqueGiftsArray.length;

  // Обновляем функцию клика по подарку
  const handleGiftClick = (gift) => {
    trackGiftClick(`gift_${gift.gift_id || gift.collection}_${gift.gift_num}`, {
      collection_name: gift.collection,
      gift_number: gift.gift_num,
      median_price_ton: gift.median_price,
      usd_value: gift.median_price * currentTonPrice,
      change_percent: gift.per_day_change
    });
    
    setSelectedGift(gift);
    setPopupOpen(true);
  };

  const handleSort = () => {
    setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
  };

  // Сортируем уникальные подарки по цене в TON
  const sortedUniqueGifts = [...uniqueGiftsArray].sort((a, b) => {
    const priceA = a?.median_price || 0;
    const priceB = b?.median_price || 0;
    return sortDirection === 'desc' ? priceB - priceA : priceA - priceB;
  });

  // Получаем видимые подарки
  const visibleGifts = sortedUniqueGifts.slice(0, visibleCount);
  const hasMoreGifts = visibleCount < sortedUniqueGifts.length;

  // Автоматическая ленивая загрузка при скролле
  useEffect(() => {
    const handleScroll = () => {
      if (loadingMore || !hasMoreGifts) return;

      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      // Если пользователь прокрутил до 80% от высоты страницы
      if (scrollTop + windowHeight >= documentHeight * 0.8) {
        setLoadingMore(true);
        
        setTimeout(() => {
          setVisibleCount(prev => prev + 16);
          setLoadingMore(false);
        }, 300);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadingMore, hasMoreGifts]);

  // Сброс видимых элементов при изменении сортировки
  useEffect(() => {
    setVisibleCount(16);
  }, [sortDirection]);

  // Добавляем функцию для получения данных графика конкретного подарка
  const getChartDataForGift = (gift) => {
    if (!portfolioData?.results || !gift) return [];
    
    // Находим все записи для этого подарка (по gift_id)
    const giftRecords = portfolioData.results.filter(item => 
      item.gift_id === gift.gift_id
    );
    
    // Сортируем по дате и возвращаем
    return giftRecords
      .sort((a, b) => new Date(a.dt) - new Date(b.dt))
      .map(item => ({
        dt: item.dt,
        median_price: item.median_price
      }));
  };

  // Показываем красивые скелетоны во время загрузки
  if (loading || isInitializing) {
    return <PortfolioPageSkeleton loadingProgress={loadingProgress} />;
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
    // Специальная обработка для ошибки username
    if (error.includes('USERNAME_NOT_OCCUPIED') || error.includes('failed to resolve username') || error.includes('Username not found') || error.includes('username')) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
          <div className="text-center max-w-xs mx-auto p-5 bg-white rounded-2xl shadow-xl border border-gray-100">
            <div className="text-4xl mb-3">👤</div>
            <h2 className="text-lg font-bold mb-2 text-gray-800">Username Required</h2>
            <p className="text-gray-600 mb-3 leading-relaxed text-sm">
              You need to set up a <strong>username</strong> in your Telegram account to use this app and view your gifts collection.
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
              <p className="text-xs text-gray-500 mb-1">Current user: {user?.first_name || 'Unknown'}</p>
              <p className="text-xs text-gray-400">User ID: {user?.id || 'Unknown'}</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="text-center max-w-xs mx-auto p-5 bg-white rounded-2xl shadow-xl border border-gray-100">
          <div className="text-red-500 text-5xl mb-3">❌</div>
          <h2 className="text-lg font-bold mb-2 text-gray-800">Error Loading Portfolio</h2>
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

  if (!portfolioData || results.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="text-center max-w-xs mx-auto p-5 bg-white rounded-2xl shadow-xl border border-gray-100">
          <div className="text-gray-400 text-5xl mb-3">📭</div>
          <h2 className="text-lg font-bold mb-2 text-gray-800">No Gifts Found</h2>
          <p className="text-gray-600 text-sm">
            You don't have any gifts in your collection yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-lg">
        {/* User Info Header - исправляем отображение */}
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
                  {user?.first_name?.[0] || 'T'}
                </span>
              </div>
            )}
            <div className="w-5 h-5 bg-blue-500 rounded-full items-center justify-center mr-2 hidden">
              <span className="text-white text-xs font-bold">
                {user?.first_name?.[0] || 'T'}
              </span>
            </div>
            <span className="text-gray-700 font-bold text-sm">@{getUsername() || 'user'} • {totalMarketCap.toFixed(2)} TON • </span>
            <span className="text-orange-500 font-bold text-sm">🎁 {totalUniqueGifts}</span>
          </div>
        </div>

        <div className="px-4 pb-20">
          {/* Title with Sort */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-gray-500 ml-2 text-xs font-medium uppercase tracking-wide">MY GIFTS</h2>
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
          
          {/* Gift grid */}
          <div className="grid grid-cols-3 gap-3">
            {visibleGifts.map((gift, index) => (
              <GiftCard
                key={`${gift.collection}_${gift.gift_num}_${index}`}
                gift={gift}
                backdrop={getBackdropByName(gift)}
                onClick={() => handleGiftClick(gift)}
              />
            ))}
          </div>

          {/* Loading indicator */}
          {loadingMore && (
            <div className="flex justify-center mt-6">
              <div className="text-gray-500 text-sm">Loading more gifts...</div>
            </div>
          )}
        </div>
      </div>
      
      {/* Popup with chart */}
      <PopupGiftChart
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        gift={selectedGift}
        chartData={selectedGift ? getChartDataForGift(selectedGift) : []}
        backdrops={backdrops}
        currentTonPrice={currentTonPrice}
      />
    </div>
  );
};

export default PortfolioPage;
