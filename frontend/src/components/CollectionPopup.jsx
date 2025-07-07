import React, { useState } from 'react';
import { FaDollarSign } from 'react-icons/fa';
import GiftIndexLogo from '../assets/Giftindex_logo.svg';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid
} from 'recharts';

// Иконка TON
const TonIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className={className}>
    <path fill="#08C" d="M19.011 9.201L12.66 19.316a.857.857 0 0 1-1.453-.005L4.98 9.197a1.8 1.8 0 0 1-.266-.943a1.856 1.856 0 0 1 1.881-1.826h10.817c1.033 0 1.873.815 1.873 1.822c0 .334-.094.664-.274.951M6.51 8.863l4.632 7.144V8.143H6.994c-.48 0-.694.317-.484.72m6.347 7.144l4.633-7.144c.214-.403-.005-.72-.485-.720h-4.148z"/>
  </svg>
);

const CollectionPopup = ({
  open,
  onClose,
  collection,
  chartData,
  currentTonPrice = 3.0,
  section = 'marketcap',
  activeFilter = 'MARKET',
  activeCurrency: propActiveCurrency = 'TON',
  onCurrencyChange // новый проп, если хотим управлять валютой из родителя
}) => {
  // Локальный стейт для валюты, если не управляется снаружи
  const [localCurrency, setLocalCurrency] = useState(propActiveCurrency || 'TON');
  const activeCurrency = onCurrencyChange ? propActiveCurrency : localCurrency;

  // Функция форматирования даты
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Tooltip для графика
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      // Используем dayChange из данных, если есть
      const dayChange = typeof data.dayChange !== 'undefined'
        ? data.dayChange
        : 0;
      // Покупки и объем за день
      const purchases = data.orders ?? data.purchases ?? '—';
      const volume = data.volume ?? data.turnover ?? '—';

      return (
        <div className="bg-white px-3 py-2 border border-gray-200 rounded-lg shadow-xl">
          <p className="text-gray-600 text-xs mb-1">{formatDate(data.dt)}</p>
          <p className="text-gray-800 font-bold text-sm">
            {activeCurrency === 'TON'
              ? `${(data[priceKey] ?? '-').toFixed?.(2) || '-'} TON`
              : `$${((data[priceKey] || 0) * currentTonPrice).toFixed(2)}`
            }
          </p>
          <p className={`text-xs font-medium ${dayChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {`Day Change: ${dayChange >= 0 ? '+' : ''}${dayChange?.toFixed(2)}%`}
          </p>
          <p className="text-xs text-blue-600 font-medium">
            {`Purchases: ${purchases}`}
          </p>
          <p className="text-xs text-purple-600 font-medium">
            {`Volume: ${activeCurrency === 'TON'
              ? `${volume} TON`
              : `$${(volume * currentTonPrice).toFixed(2)}`
            }`}
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom dot для графика
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

  // priceKey зависит от activeFilter
  const priceKey = activeFilter === 'FLOOR' ? 'floor_price' : 'median_price';

  // Формируем статистику в зависимости от секции
  const stats = [
    { 
      label: 'Changes', 
      value: activeFilter === 'FLOOR' 
        ? `${collection?.floor_day_change >= 0 ? '+' : ''}${collection?.floor_day_change?.toFixed(1) || '0.0'}%`
        : `${collection?.median_price_day_change >= 0 ? '+' : ''}${collection?.median_price_day_change?.toFixed(1) || '0.0'}%`
    },
    { label: activeFilter === 'FLOOR' ? 'Floor Price' : 'Median Price', value: activeCurrency === 'TON'
        ? `${collection?.floorPriceTON || '—'}`
        : `$${collection?.floorPriceUSD || '—'}` },
    { label: 'Market Cap', value: activeCurrency === 'TON'
        ? `${collection?.mcapTON || '—'}`
        : `$${collection?.mcap || '—'}` },
    { label: 'Volume', value: activeCurrency === 'TON'
        ? `${collection?.volume || '—'} TON`
        : `$${((collection?.volume || 0) * currentTonPrice).toFixed(1)}` },
    { label: 'Purchases', value: collection?.orders || '—' },
    { label: 'Total Supply', value: collection?.gifts || '—' }
  ];

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
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-full flex items-center justify-center ml-6 bg-transparent">
              <img
                src={collection?.icon}
                alt={collection?.name}
                className="w-14 h-14 object-cover"
                style={{ background: 'transparent' }}
              />
            </div>
            <div className="flex-1">
              <div className="font-bold text-base text-gray-800">{collection?.name}</div>
              <div className="text-sm text-gray-500">{section}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Currency Switch - теперь рабочий */}
            <div className="flex bg-gray-100 rounded-lg p-1 mt-1 z-20">
              <button
                className={`flex items-center justify-center w-8 h-6 rounded transition-all duration-200 ${
                  activeCurrency === 'TON'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => {
                  if (activeCurrency !== 'TON') {
                    if (onCurrencyChange) onCurrencyChange('TON');
                    else setLocalCurrency('TON');
                  }
                }}
                type="button"
              >
                <TonIcon className="w-4 h-4" />
              </button>
              <button
                className={`flex items-center justify-center w-8 h-6 rounded transition-all duration-200 ${
                  activeCurrency === 'USDT'
                    ? 'bg-white text-green-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => {
                  if (activeCurrency !== 'USDT') {
                    if (onCurrencyChange) onCurrencyChange('USDT');
                    else setLocalCurrency('USDT');
                  }
                }}
                type="button"
              >
                <FaDollarSign className="w-3 h-3" />
              </button>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-4xl leading-none p-4">×</button>
          </div>
        </div>

        {/* Chart */}
        <div className="mb-4">
          <div className="text-xs ml-6 text-gray-500 mb-2">
            {activeFilter === 'FLOOR' ? 'Floor Price Dynamic' : 'Median Price Dynamic'}
          </div>
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
                  tickFormatter={(value) =>
                    activeCurrency === 'TON'
                      ? `${value?.toFixed?.(1)}`
                      : `$${(value * currentTonPrice).toFixed(0)}`
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
                  dataKey={
                    activeCurrency === 'TON'
                      ? priceKey
                      : (entry) => (entry[priceKey] || 0) * currentTonPrice
                  }
                  stroke="url(#lineGradient)"
                  strokeWidth={3}
                  fill="url(#priceGradient)"
                  animationDuration={1000}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-3 grid-rows-2 gap-x-6 gap-y-2 mt-2 items-center px-6">
          {stats.map((stat, idx) => (
            <div key={idx}>
              <div className="text-xs text-gray-500">{stat.label}</div>
              <div className="font-bold text-sm text-gray-800">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CollectionPopup;
