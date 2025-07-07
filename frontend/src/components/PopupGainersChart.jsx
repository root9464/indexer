import React, { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { FaDollarSign } from 'react-icons/fa';
import { FiTrendingUp, FiTrendingDown } from 'react-icons/fi';
import GiftIndexLogo from '../assets/Giftindex_logo.svg';

// Компонент иконки TON
const TonIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className={className}>
    <path fill="#08C" d="M19.011 9.201L12.66 19.316a.857.857 0 0 1-1.453-.005L4.98 9.197a1.8 1.8 0 0 1-.266-.943a1.856 1.856 0 0 1 1.881-1.826h10.817c1.033 0 1.873.815 1.873 1.822c0 .334-.094.664-.274.951M6.51 8.863l4.632 7.144V8.143H6.994c-.48 0-.694.317-.484.72m6.347 7.144l4.633-7.144c.214-.403-.005-.720-.485-.720h-4.148z"/>
  </svg>
);

const PopupGainersChart = ({ 
  open, 
  onClose, 
  collection, 
  chartData, 
  currentTonPrice = 3.0,
  initialCurrency = 'TON',
  purchasesChange = 0
}) => {
  // Локальный стейт для валюты
  const [activeCurrency, setActiveCurrency] = useState(initialCurrency);

  // Сброс валюты при открытии попапа
  useEffect(() => {
    setActiveCurrency(initialCurrency);
  }, [initialCurrency, open]);

  // Определяем цветовую схему на основе purchasesChange
  const isPositive = purchasesChange >= 0;
  const trendColor = isPositive ? '#10b981' : '#ef4444'; // green-500 : red-500
  const trendColorLight = isPositive ? '#059669' : '#dc2626'; // green-600 : red-600
  const trendColorDark = isPositive ? '#34d399' : '#f87171'; // green-400 : red-400
  const bgClass = isPositive ? 'bg-green-100' : 'bg-red-100';
  const textClass = isPositive ? 'text-green-500' : 'text-red-500';

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

  // Custom tooltip для графика покупок
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      // Используем purchasesChange из данных дня
      const purchasesChangeDay = typeof data.purchasesChange === 'number' ? data.purchasesChange : 0;
      const priceChangeDay = typeof data.priceChange === 'number' ? data.priceChange : 0;
      
      return (
        <div className="bg-white px-3 py-2 border border-gray-200 rounded-lg shadow-xl">
          <p className="text-gray-600 text-xs mb-1">{formatDate(data.dt)}</p>
          <p className="text-gray-800 font-bold text-sm">
            {`${data.purchases || 0} Purchases`}
          </p>
          <p className={`text-xs font-medium ${purchasesChangeDay >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            Purchases: {purchasesChangeDay >= 0 ? '+' : ''}{purchasesChangeDay.toFixed(1)}%
          </p>
          <p className={`text-xs font-medium ${priceChangeDay >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
            Price: {priceChangeDay >= 0 ? '+' : ''}{priceChangeDay.toFixed(1)}%
          </p>
          {data.volume && (
            <p className="text-gray-600 text-xs">
              Volume: {activeCurrency === 'TON' 
                ? `${data.volume.toFixed(1)} TON` 
                : `$${(data.volume * currentTonPrice).toFixed(0)}`
              }
            </p>
          )}
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

  // Функция для получения числа покупок
  const getPurchasesNumber = (collection, chartData) => {
    if (typeof collection?.total_purchases === 'number') {
      return collection.total_purchases;
    }
    if (typeof collection?.purchases === 'string') {
      return parseInt(collection.purchases.replace(/[^\d]/g, '')) || 0;
    }
    if (typeof collection?.purchases === 'number') {
      return collection.purchases;
    }
    // fallback: берем последние purchases из chartData
    return chartData?.[chartData.length - 1]?.purchases || 0;
  };

  // Функция для получения volume
  const getVolumeNumber = (collection, chartData) => {
    if (typeof collection?.total_volume === 'number') {
      return collection.total_volume;
    }
    if (typeof collection?.volume === 'number') {
      return collection.volume;
    }
    // fallback: берем последний volume из chartData
    return chartData?.[chartData.length - 1]?.volume || 0;
  };

  // Форматирование числа в K/M
  const formatShort = (num) => {
    if (typeof num !== 'number' || isNaN(num)) return '—';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 10_000) return (num / 1_000).toFixed(0) + 'K';
    return Math.round(num).toString();
  };

  // Форматирование с пробелами для больших чисел
  const formatNumberWithSpaces = (num) => {
    const rounded = Math.round(num);
    return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center transition-all duration-300 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{ background: open ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0)', transition: 'background 0.3s' }}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg bg-white rounded-t-2xl shadow-2xl p-2 pb-10 transition-transform duration-300 ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{
          minHeight: 450,
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
                background: `radial-gradient(circle at 60% 40%, ${trendColor} 60%, ${trendColorLight} 100%)`
              }}
            >
              {/* Поддержка PNG или emoji */}
              {collection?.icon && typeof collection.icon === 'string' && collection.icon.match(/\.(png|jpg|jpeg|gif|svg)$/i) ? (
                <img src={collection.icon} alt="icon" className="w-8 h-8 object-contain rounded" />
              ) : (
                <span className="text-2xl">{collection?.icon || '🎁'}</span>
              )}
            </div>
            <div className="flex-1">
              <div className="font-bold text-base text-gray-800">{collection?.name || 'Collection'}</div>
              <div className="text-sm text-gray-500">Purchases Analytics</div>
            </div>
          </div>
          
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-4xl leading-none p-4">×</button>
        </div>

        {/* Purchases Display Section */}
        <div className="px-6 mb-4 relative">
          {/* Currency Switch */}
          <div className="absolute top-0 right-6 flex bg-gray-100 rounded-lg p-1 z-20">
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

          {/* Purchases Display */}
          <div className="text-left">
            <div className="flex items-center gap-2 -ml-3">
              <div className="flex items-baseline rounded-lg px-2 py-1">
                {/* Стрелка тренда */}
                <span className={`text-sm mr-1 flex items-center`}>
                  {isPositive ? (
                    <FiTrendingUp className={`w-4 h-4 ${textClass}`} />
                  ) : (
                    <FiTrendingDown className={`w-4 h-4 ${textClass}`} />
                  )}
                </span>
                <span className={`text-xl font-mono font-bold tracking-wide ${textClass}`}>
                  {formatNumberWithSpaces(getPurchasesNumber(collection, chartData))}
                </span>
                <span className="text-sm text-gray-500 ml-1" style={{ transform: 'translateY(-1.2px)' }}>
                  purchases
                </span>
              </div>
              <span className={`${textClass} ${bgClass} rounded-lg px-2 py-1 font-medium text-xs`}>
                {purchasesChange >= 0 ? '+' : ''}{purchasesChange.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
        
        {/* Chart */}
        <div className="mb-4">
          <div className="text-xs ml-6 text-gray-500 mb-2">Purchases Dynamic</div>
          <div className="w-full h-48 px-1 ml-0 relative">
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
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                <defs>
                  <linearGradient id="purchasesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={trendColor} stopOpacity={0.3}/>
                    <stop offset="100%" stopColor={trendColor} stopOpacity={0.05}/>
                  </linearGradient>
                  <linearGradient id="purchasesLineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={trendColorLight}/>
                    <stop offset="50%" stopColor={trendColor}/>
                    <stop offset="100%" stopColor={trendColorDark}/>
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
                  domain={['dataMin - 1', 'dataMax + 1']}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickMargin={8}
                  width={40}
                  tickFormatter={(value) => `${Math.round(value)}`}
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
                  dataKey="purchases"
                  stroke="url(#purchasesLineGradient)"
                  strokeWidth={3}
                  fill="url(#purchasesGradient)"
                  dot={{ fill: trendColor, stroke: "#ffffff", strokeWidth: 2, r: 3 }}
                  activeDot={{ 
                    r: 5, 
                    fill: trendColor, 
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
            <div className="text-xs text-gray-500">Total Purchases</div>
            <div className="font-bold text-sm text-gray-800">
              {formatShort(getPurchasesNumber(collection, chartData))}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">24h Volume</div>
            <div className="font-bold text-sm text-gray-800">
              {activeCurrency === 'TON' 
                ? `${formatShort(getVolumeNumber(collection, chartData))} TON`
                : `$${formatShort(getVolumeNumber(collection, chartData) * currentTonPrice)}`
              }
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Purchases Change</div>
            <div className={`font-bold text-sm ${textClass}`}>
              {purchasesChange >= 0 ? '+' : ''}{purchasesChange.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Avg Purchase</div>
            <div className="font-bold text-sm text-gray-800">
              {activeCurrency === 'TON' 
                ? `${formatShort((getVolumeNumber(collection, chartData) / getPurchasesNumber(collection, chartData)) || 0)} TON`
                : `$${formatShort(((getVolumeNumber(collection, chartData) / getPurchasesNumber(collection, chartData)) * currentTonPrice) || 0)}`
              }
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Price Change</div>
            <div className={`font-bold text-sm ${collection?.priceChangePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {collection?.priceChangePercent >= 0 ? '+' : ''}{collection?.priceChangePercent?.toFixed(1) || '0.0'}%
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Median Price</div>
            <div className="font-bold text-sm text-gray-800">
              {activeCurrency === 'TON' 
                ? `${collection?.median_price || '—'} TON`
                : `$${((collection?.median_price || 0) * currentTonPrice).toFixed(0)}`
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PopupGainersChart;
