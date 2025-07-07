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
import { FiTrendingUp, FiTrendingDown } from 'react-icons/fi'; // импорт стрелочек
import GiftIndexLogo from '../assets/Giftindex_logo.svg';

// Компонент иконки TON
const TonIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className={className}>
    <path fill="#08C" d="M19.011 9.201L12.66 19.316a.857.857 0 0 1-1.453-.005L4.98 9.197a1.8 1.8 0 0 1-.266-.943a1.856 1.856 0 0 1 1.881-1.826h10.817c1.033 0 1.873.815 1.873 1.822c0 .334-.094.664-.274.951M6.51 8.863l4.632 7.144V8.143H6.994c-.48 0-.694.317-.484.72m6.347 7.144l4.633-7.144c.214-.403-.005-.720-.485-.720h-4.148z"/>
  </svg>
);

const VolumePopup = ({ 
  open, 
  onClose, 
  collection, 
  chartData, 
  currentTonPrice = 3.0,
  initialCurrency = 'TON',
  volumeChange = 0 // получено через защищенный BFF endpoint
}) => {
  // Локальный стейт для валюты
  const [activeCurrency, setActiveCurrency] = useState(initialCurrency);

  // Сброс валюты при открытии попапа
  useEffect(() => {
    setActiveCurrency(initialCurrency);
  }, [initialCurrency, open]);

  // Удаляем таймфреймы
  // const [activeTimeframe, setActiveTimeframe] = useState('All');
  // const timeframes = ['1D', '7D', '1М', '3М', 'All'];

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

  // Custom tooltip for volume chart
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      // Используем volumeChange из данных дня
      const volumeChangeDay = typeof data.volumeChange === 'number' ? data.volumeChange : 0;
      return (
        <div className="bg-white px-3 py-2 border border-gray-200 rounded-lg shadow-xl">
          <p className="text-gray-600 text-xs mb-1">{formatDate(data.dt)}</p>
          <p className="text-gray-800 font-bold text-sm">
            {activeCurrency === 'TON' 
              ? `${data.volume.toFixed(1)} TON` 
              : `$${(data.volume * currentTonPrice).toFixed(0)}`
            }
          </p>
          <p className="text-blue-600 text-xs">Volume</p>
          <p className={`text-xs font-medium ${volumeChangeDay >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {volumeChangeDay >= 0 ? '+' : ''}{volumeChangeDay.toFixed(2)}%
          </p>
          {data.orders && (
            <p className="text-gray-600 text-xs">Orders: {data.orders}</p>
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
        fill="#3b82f6" 
        stroke="#ffffff" 
        strokeWidth={2}
        className="drop-shadow-sm"
      />
    );
  };

  const getVolumeNumber = (collection, chartData) => {
    if (typeof collection?.volume === 'string') {
      return parseFloat(collection.volume.replace('TON', '').replace(/\s/g, '')) || 0;
    }
    if (typeof collection?.volume === 'number') {
      return collection.volume;
    }
    // fallback: берем последний volume из chartData
    return chartData?.[chartData.length - 1]?.volume || 0;
  };

  // Форматирование числа в K/M, без округления для < 10_000, 1 знак после запятой
  const formatShort = (num) => {
    if (typeof num !== 'number' || isNaN(num)) return '—';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 10_000) return (num / 1_000).toFixed(0) + 'K';
    return num.toFixed(1);
  };

  // Для orders всегда целое число
  const formatOrders = (num) => {
    if (typeof num !== 'number' || isNaN(num)) return '—';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 10_000) return (num / 1_000).toFixed(0) + 'K';
    return Math.round(num).toString();
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
                background: `radial-gradient(circle at 60% 40%, #3b82f6 60%, #1e40af 100%)`
              }}
            >
              {/* Поддержка PNG или любого изображения */}
              {collection?.icon && typeof collection.icon === 'string' && collection.icon.match(/\.(png|jpg|jpeg|gif|svg)$/i) ? (
                <img src={collection.icon} alt="icon" className="w-8 h-8 object-contain rounded" />
              ) : (
                <span className="text-2xl">{collection?.icon || '📊'}</span>
              )}
            </div>
            <div className="flex-1">
              <div className="font-bold text-base text-gray-800">{collection?.name || 'Collection'}</div>
              <div className="text-sm text-gray-500">Volume Analytics</div>
            </div>
          </div>
          
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-4xl leading-none p-4">×</button>
        </div>

        {/* Price Display Section */}
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

          {/* Volume Display */}
          <div className="text-left">
            <div className="flex items-center gap-2 -ml-3">
              <div className="flex items-baseline rounded-lg px-2 py-1">
                {/* Стрелка тренда вместо ▲▼ */}
                <span className={`text-sm mr-1 flex items-center`}>
                  {volumeChange >= 0 ? (
                    <FiTrendingUp className="w-4 h-4 text-blue-500" />
                  ) : (
                    <FiTrendingDown className="w-4 h-4 text-red-500" />
                  )}
                </span>
                {activeCurrency === 'USDT' && (
                  <span className={`text-xl font-mono font-bold tracking-wide mr-1 ${
                    volumeChange < 0 ? 'text-red-500' : 'text-blue-500'
                  }`}>$</span>
                )}
                <span className={`text-xl font-mono font-bold tracking-wide ${volumeChange >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                  {activeCurrency === 'TON' 
                    ? Math.round(getVolumeNumber(collection, chartData))
                    : (getVolumeNumber(collection, chartData) * currentTonPrice).toFixed(0)
                  }
                </span>
                {activeCurrency === 'TON' && (
                  <span className="text-sm text-gray-500 ml-1" style={{ transform: 'translateY(-1.2px)' }}>
                    TON
                  </span>
                )}
              </div>
              <span className={`${volumeChange >= 0 ? 'text-blue-500 bg-blue-100' : 'text-red-500 bg-red-100'} rounded-lg px-2 py-1 font-medium text-xs`}>
                {volumeChange >= 0 ? '+' : ''}{volumeChange.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
        
        {/* Chart */}
        <div className="mb-4">
          <div className="text-xs ml-6 text-gray-500 mb-2">Volume Dynamic</div>
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
                  <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05}/>
                  </linearGradient>
                  <linearGradient id="volumeLineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#1e40af"/>
                    <stop offset="50%" stopColor="#3b82f6"/>
                    <stop offset="100%" stopColor="#60a5fa"/>
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
                  tickFormatter={(value) => 
                    activeCurrency === 'TON' ? `${value.toFixed(0)}` : `$${(value * currentTonPrice).toFixed(0)}`
                  }
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
                  dataKey={activeCurrency === 'TON' ? 'volume' : (entry) => entry.volume * currentTonPrice}
                  stroke="url(#volumeLineGradient)"
                  strokeWidth={3}
                  fill="url(#volumeGradient)"
                  dot={<CustomDot />}
                  activeDot={{ 
                    r: 5, 
                    fill: "#3b82f6", 
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

          {/* Удаляем Time Frame Buttons */}
          {/* 
          <div className="flex justify-center gap-1 bg-gray-100 rounded-2xl p-0.5 mx-6 mt-4">
            {timeframes.map((timeframe) => (
              <button
                key={timeframe}
                onClick={() => setActiveTimeframe(timeframe)}
                className={`flex-1 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
                  activeTimeframe === timeframe
                    ? 'bg-white text-gray-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {timeframe}
              </button>
            ))}
          </div>
          */}
        </div>
        
        {/* Statistics */}
        <div className="grid grid-cols-3 grid-rows-2 gap-x-6 gap-y-2 mt-2 items-center px-6">
          <div>
            <div className="text-xs text-gray-500">24h Volume</div>
            <div className="font-bold text-sm text-gray-800">
              {activeCurrency === 'TON' 
                ? `${Math.round(getVolumeNumber(collection, chartData))} TON`
                : `$${formatShort(getVolumeNumber(collection, chartData) * currentTonPrice)}`
              }
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">24h Orders</div>
            <div className="font-bold text-sm text-gray-800">
              {formatOrders(collection?.orders || chartData[chartData.length - 1]?.orders || 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Volume Change</div>
            <div className={`font-bold text-sm ${volumeChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {volumeChange >= 0 ? '+' : ''}{volumeChange.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Avg Order Size</div>
            <div className="font-bold text-sm text-gray-800">
              {activeCurrency === 'TON' 
                ? `${formatShort((getVolumeNumber(collection, chartData) / (collection?.orders || 1)) || 0)} TON`
                : <span className={((getVolumeNumber(collection, chartData) / (collection?.orders || 1)) * currentTonPrice) < 0 ? "text-red-500" : ""}>
                    ${formatShort(((getVolumeNumber(collection, chartData) / (collection?.orders || 1)) * currentTonPrice) || 0)}
                  </span>
              }
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Peak Volume</div>
            <div className="font-bold text-sm text-gray-800">
              {activeCurrency === 'TON' 
                ? `${formatShort(Math.max(...chartData.map(d => d.volume || 0)))} TON`
                : <span className={(Math.max(...chartData.map(d => d.volume || 0)) * currentTonPrice) < 0 ? "text-red-500" : ""}>
                    ${formatShort(Math.max(...chartData.map(d => d.volume || 0)) * currentTonPrice)}
                  </span>
              }
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Mcap Floor</div>
            <div className="font-bold text-sm text-gray-800">
              {collection?.mcap_floor
                ? (
                  activeCurrency === 'TON'
                    ? `${formatShort(Number(collection.mcap_floor))} TON`
                    : <span className={(Number(collection.mcap_floor) * currentTonPrice) < 0 ? "text-red-500" : ""}>
                        ${formatShort(Number(collection.mcap_floor) * currentTonPrice)}
                      </span>
                  )
                : '—'}
            </div>
          </div>
        </div>

        {/* Удаляем Action Button */}
        {/* 
        <div className="px-6 mt-6">
          <button 
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-colors"
            onClick={() => console.log('View Collection Details')}
          >
            View Collection Details
          </button>
        </div>
        */}
      </div>
    </div>
  );
};

export default VolumePopup;
