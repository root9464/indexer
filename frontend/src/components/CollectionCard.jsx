import React from 'react';

// Импортируем SVG как React-компонент
import GiftindexLogo from '../assets/Giftindex_logo.svg';

// Локальный компонент TonIcon (скопирован из MarketPage)
const TonIcon = ({ className = "", width = 20, height = 20 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox="0 0 24 24" className={className}>
    <path fill="#08C" d="M19.011 9.201L12.66 19.316a.857.857 0 0 1-1.453-.005L4.98 9.197a1.8 1.8 0 0 1-.266-.943a1.856 1.856 0 0 1 1.881-1.826h10.817c1.033 0 1.873.815 1.873 1.822c0 .334-.094.664-.274.951M6.51 8.863l4.632 7.144V8.143H6.994c-.48 0-.694.317-.484.72m6.347 7.144l4.633-7.144c.214-.403-.005-.72-.485-.720h-4.148z"/>
  </svg>
);

// Иконка графика для изменения MCAP
const ChartIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 20 20">
    <path d="M3 17V9.5M7 17V5.5M11 17V13.5M15 17V3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// Иконка стрелки для изменения floor price
const ArrowIcon = ({ up, className = "w-4 h-4" }) => (
  up
    ? <svg className={className} fill="none" viewBox="0 0 20 20"><path d="M10 15V5M10 5l-5 5M10 5l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
    : <svg className={className} fill="none" viewBox="0 0 20 20"><path d="M10 5v10M10 15l-5-5M10 15l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
);

// Функция для сокращения чисел до K/M
function formatNumberShort(value) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1e6) return (value / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1e3) return (value / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return value.toString();
}

// Форматирование floor price: если целое — без десятых, иначе — одна десятая
function formatFloorPrice(value) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
}

// Форматирование $-значений с сокращением и 1 знаком после запятой
function formatUsdShort(value) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1e6) return '$' + (value / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1e3) return '$' + (value / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  if (Number.isInteger(value)) return '$' + value.toString();
  return '$' + value.toFixed(1);
}

// Компонент скелетона для карточки коллекции
const CollectionCardSkeleton = () => (
  <div
    className="relative rounded-lg overflow-hidden shadow-lg flex flex-col animate-pulse"
    style={{
      background: `linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)`,
      boxShadow: '0 4px 24px 0 rgba(0,0,0,0.10)',
      width: '100%',
      height: '170px',
      minWidth: '150px',
      minHeight: '170px',
      maxWidth: '100%',
    }}
  >
    {/* Shimmer эффект */}
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: `
          radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 70%),
          radial-gradient(circle at 80% 80%, rgba(255,255,255,0.10) 0%, transparent 70%)
        `,
      }}
    />
    
    <div className="relative p-3 mt-1 flex flex-col h-full z-10">
      {/* Название коллекции skeleton */}
      <div className="flex items-center mb-1">
        <div className="w-8 h-8 bg-gray-300 rounded-full mr-1 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 animate-shimmer"></div>
        </div>
        <div className="bg-gray-300 rounded h-4 w-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 animate-shimmer"></div>
        </div>
      </div>
      
      <div className="mt-1">
        <div className="flex items-center justify-between mt-0.5">
          {/* Цена skeleton */}
          <div className="flex items-center">
            <div className="bg-gray-300 rounded h-5 w-16 mr-2 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 animate-shimmer"></div>
            </div>
            <div className="bg-gray-300 rounded h-3 w-12 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 animate-shimmer"></div>
            </div>
          </div>
          {/* Процент skeleton */}
          <div className="bg-gray-300 rounded h-4 w-14 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 animate-shimmer"></div>
          </div>
        </div>
        
        <div className="border-t border-gray-400 my-1" />
        
        <div className="flex items-center justify-between text-xs">
          <div className="bg-gray-300 rounded h-3 w-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 animate-shimmer"></div>
          </div>
          <div className="flex items-center">
            <div className="bg-gray-300 rounded h-3 w-12 mr-2 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 animate-shimmer"></div>
            </div>
            <div className="bg-gray-300 rounded h-3 w-10 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 animate-shimmer"></div>
            </div>
          </div>
        </div>
        
        <div className="border-t border-gray-400 my-1" />
        
        <div className="flex items-center justify-between text-xs">
          <div className="bg-gray-300 rounded h-3 w-16 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 animate-shimmer"></div>
          </div>
          <div className="bg-gray-300 rounded h-3 w-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 animate-shimmer"></div>
          </div>
        </div>
      </div>
    </div>
    
    {/* Логотип skeleton */}
    <div
      className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex justify-center items-center w-full z-20"
      style={{ opacity: 0.15 }}
    >
      <div className="w-16 h-5 bg-gray-400 rounded relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-gray-400 via-gray-300 to-gray-400 animate-shimmer"></div>
      </div>
    </div>
  </div>
);

const CollectionCard = ({ name, image, price, percentChange, mcap, mcapChange, orders, tonPrice, loading = false }) => {
  if (loading) {
    return <CollectionCardSkeleton />;
  }

  // Определяем цвет для процентного изменения
  const changeColor = percentChange >= 0 ? 'text-green-500' : 'text-red-500';
  const changeIcon = percentChange >= 0 ? '+' : '';

  const mcapColor = mcapChange >= 0 ? 'text-green-500' : 'text-red-500';
  const mcapIcon = mcapChange >= 0 ? '+' : '';

  // Функция для форматирования TON в USD (возвращает число)
  function tonToUsd(tonValue) {
    if (!tonPrice || isNaN(tonValue)) return null;
    return tonValue * tonPrice;
  }

  // Цветовая подсветка для градиента: зелёный при росте, красный при падении
  const accentGradient =
    percentChange >= 0
      ? 'radial-gradient(circle at 80% 80%, rgba(0,255,100,0.10) 0%, transparent 70%)'
      : 'radial-gradient(circle at 80% 80%, rgba(255,40,40,0.10) 0%, transparent 70%)';

  return (
    <div
      className="relative rounded-lg overflow-hidden shadow-lg transition-transform hover:scale-105 flex flex-col"
      style={{
        background: `linear-gradient(135deg, #232526 0%, #414345 100%)`,
        boxShadow: '0 4px 24px 0 rgba(0, 184, 255, 0.10), 0 1.5px 8px 0 rgba(0,0,0,0.10)',
        width: '100%',
        height: '170px',
        minWidth: '150px',
        minHeight: '170px',
        maxWidth: '100%',
      }}
    >
      {/* Эффект свечения + цветовой акцент */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 80% 20%, rgba(0,184,255,0.15) 0%, transparent 70%),
            ${accentGradient}
          `,
        }}
      />
      <div className="relative p-3 mt-1 flex flex-col h-full z-10">
        {/* Название коллекции - уменьшаем размер и сокращаем при необходимости */}
        <div className="flex items-center mb-1">
          {image && (
            <img
              src={image}
              alt={name}
              className="w-8 h-8 rounded-full mr-1 object-cover"
              onError={(e) => { e.target.src = 'https://via.placeholder.com/24'; }}
            />
          )}
          <h3 className="text-white font-semibold text-sm truncate" title={name}>
            {name.length > 14 ? name.substring(0, 12) + '...' : name}
          </h3>
        </div>
        <div className="mt-1">
          <div className="flex items-center justify-between mt-0.5">
            {/* Блок с ценой и TON-иконкой фиксированной ширины */}
            <div className="flex items-center">
              <span className="text-white font-bold -mt-1 text-lg flex items-center min-w-[56px]">
                {formatFloorPrice(Number(price))}
                <TonIcon width={22} height={22} />
              </span>
              {tonPrice && !isNaN(price) && (
                <span className="text-xs text-gray-300 opacity-70 ">
                  {formatUsdShort(tonToUsd(price))}
                </span>
              )}
            </div>
            {/* Фиксированная ширина для процентов, чтобы все было ровно */}
            <span className={`flex items-center ${changeColor} text-xs font-medium w-[58px] justify-end`}>
              <ArrowIcon up={percentChange >= 0} className="w-3 h-3 mr-0.5" />
              {changeIcon}{Math.abs(percentChange).toFixed(1)}%
            </span>
          </div>
          <div className="border-t border-gray-700 my-1" />
          <div className="flex items-center justify-between text-xs">
            <div className="text-gray-400">MCAP</div>
            <div className="flex items-center">
              <span className="text-white font-medium flex items-center min-w-[56px] ml-4">
                {typeof mcap === 'number' ? formatNumberShort(mcap) : '-'}
                <TonIcon width={16} height={16} />
              </span>
              {tonPrice && typeof mcap === 'number' && (
                <span className="text-gray-300 opacity-70 text-xs ml-2">
                  {formatUsdShort(tonToUsd(mcap))}
                </span>
              )}
            </div>
          </div>
          <div className="border-t border-gray-700 my-1" />
          <div className="flex items-center justify-between text-xs">
            <div className="text-gray-400">Daily Sales</div>
            <div className="text-white font-medium">
              {typeof orders === 'number' ? formatNumberShort(orders) : '-'}
            </div>
          </div>
        </div>
      </div>
      {/* Логотип внизу по центру */}
      <div
        className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex justify-center items-center w-full z-20"
        style={{
          opacity: 0.15,
        }}
      >
        <img
          src={GiftindexLogo}
          alt="Giftindex logo"
          style={{
            width: 64,
            height: 20,
            fontWeight: 'bold',
          }}
        />
      </div>
    </div>
  );
};

export default CollectionCard;
