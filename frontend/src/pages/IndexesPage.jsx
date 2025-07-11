import { Address } from '@ton/core';
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import GiftIndexLogo from '../assets/Giftindex_logo.svg';
import { useJettonWallet } from '../hooks/useJettonWallet';
import { useTelegram } from '../hooks/useTelegram';
import { makeAsk } from '../utils/ton/ton';

// Компонент иконки TON
const TonIcon = ({ className = 'w-4 h-4' }) => (
  <svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' className={className}>
    <path
      fill='#08C'
      d='M19.011 9.201L12.66 19.316a.857.857 0 0 1-1.453-.005L4.98 9.197a1.8 1.8 0 0 1-.266-.943a1.856 1.856 0 0 1 1.881-1.826h10.817c1.033 0 1.873.815 1.873 1.822c0 .334-.094.664-.274.951M6.51 8.863l4.632 7.144V8.143H6.994c-.48 0-.694.317-.484.72m6.347 7.144l4.633-7.144c.214-.403-.005-.72-.485-.720h-4.148z'
    />
  </svg>
);

// Компонент попапа для индексов
const PopupIndexChart = ({ open, onClose, index, chartData, currentTonPrice = 3.0 }) => {
  const [activeTradeTab, setActiveTradeTab] = useState('trade'); // 'trade', 'orders'
  const [orderPercent, setOrderPercent] = useState(0);
  const [volumePercent, setVolumePercent] = useState(50);
  const [activeTimeframe, setActiveTimeframe] = useState('All');
  const address = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

  const [tradeAmount, setTradeAmount] = useState(0);

  const { data: jettons } = useJettonWallet({ address: address });

  const jettonWallet = jettons?.balances?.find((balance) => balance.jetton.symbol === 'TUSDT');

  const jettonAddress = jettonWallet ? Address.parse(jettonWallet.wallet_address.address).toString() : null;
  console.log(jettonAddress);

  const messageAsk = jettonAddress ? makeAsk(tradeAmount, jettonAddress) : null;

  const timeframes = ['1D', '7D', '1М', '3М', 'All'];

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const priceChange = chartData.length > 1 ? ((data.value - chartData[0].value) / chartData[0].value) * 100 : 0;

      return (
        <div className='bg-white px-3 py-2 border border-gray-200 rounded-lg shadow-xl'>
          <p className='text-gray-600 text-xs mb-1'>{formatDate(data.dt)}</p>
          <p className='text-gray-800 font-bold text-sm'>${(data.value * currentTonPrice).toFixed(2)}</p>
          <p className={`text-xs font-medium ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {priceChange >= 0 ? '+' : ''}
            {priceChange.toFixed(2)}%
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomDot = (props) => {
    const { cx, cy, payload } = props;
    if (!payload) return null;

    return <circle cx={cx} cy={cy} r={3} fill='#10b981' stroke='#ffffff' strokeWidth={2} className='drop-shadow-sm' />;
  };

  // Вычисляем процентное изменение для отображения
  const priceChange = chartData.length > 1 ? ((chartData[chartData.length - 1]?.value - chartData[0]?.value) / chartData[0]?.value) * 100 : 0;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center transition-all duration-300 ${
        open ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
      style={{ background: open ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0)', transition: 'background 0.3s' }}
      onClick={onClose}>
      <div
        className={`w-full bg-white rounded-t-2xl shadow-2xl p-4 pb-4 transition-transform duration-300 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{
          minHeight: 450,
          marginBottom: '55px',
          marginLeft: 'auto',
          marginRight: 'auto',
          left: 0,
          right: 5,
          maxWidth: '420px',
        }}
        onClick={(e) => e.stopPropagation()}>
        {/* Price Display Section */}
        <div className='px-3 relative'>
          {/* Close Button */}
          <button
            onClick={onClose}
            className='absolute top-0 right-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors'>
            <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
            </svg>
          </button>

          {/* Price Display */}
          <div className='text-left'>
            <div className='flex items-center gap-2 -ml-3'>
              <div className='flex items-baseline rounded-lg px-2 py-1'>
                <span className={`text-sm mr-1 flex items-center ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {priceChange >= 0 ? '▲' : '▼'}
                </span>
                <span className='text-xl font-mono font-bold text-green-500 tracking-wide mr-1'>$</span>
                <span className='text-xl font-mono font-bold text-green-500 tracking-wide'>
                  {index?.price ? index.price.replace('$', '') : '0.00'}
                </span>
              </div>
              <span
                className={`${
                  priceChange >= 0 ? 'text-green-500 bg-green-100' : 'text-red-500 bg-red-100'
                } rounded-lg px-2 py-1 font-medium text-xs`}>
                {priceChange >= 0 ? '+' : ''}
                {priceChange.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className='mb-2'>
          <div className='text-xs ml-3 text-gray-500 mb-1'>Price Dynamic</div>
          <div className='w-full h-40 px-1 ml-0 relative'>
            {/* Водяной знак логотипа позади графика */}
            <div className='absolute inset-0 flex items-center justify-center pointer-events-none z-0'>
              <img
                src={GiftIndexLogo}
                alt='GiftIndex'
                className='w-28 h-auto opacity-50'
                style={{
                  filter: 'grayscale(1) brightness(0.6)',
                }}
              />
            </div>

            <ResponsiveContainer width='100%' height='100%'>
              <AreaChart data={chartData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id='priceGradient' x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0%' stopColor='#10b981' stopOpacity={0.3} />
                    <stop offset='100%' stopColor='#10b981' stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id='lineGradient' x1='0' y1='0' x2='1' y2='0'>
                    <stop offset='0%' stopColor='#059669' />
                    <stop offset='50%' stopColor='#10b981' />
                    <stop offset='100%' stopColor='#34d399' />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey='dt'
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
                  tickFormatter={(value) => `$${(value * currentTonPrice).toFixed(0)}`}
                />
                <CartesianGrid horizontal={true} vertical={false} stroke='#f3f4f6' strokeWidth={1} strokeDasharray='3 3' />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type='monotone'
                  dataKey={(entry) => entry.value * currentTonPrice}
                  stroke='url(#lineGradient)'
                  strokeWidth={3}
                  fill='url(#priceGradient)'
                  dot={<CustomDot />}
                  activeDot={{
                    r: 5,
                    fill: '#10b981',
                    stroke: '#ffffff',
                    strokeWidth: 3,
                    className: 'drop-shadow-lg',
                  }}
                  animationDuration={1000}
                  animationEasing='ease-out'
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Time Frame Buttons */}
          <div className='flex justify-center gap-1 bg-gray-100 rounded-2xl p-0.5 mx-3 mt-2'>
            {timeframes.map((timeframe) => (
              <button
                key={timeframe}
                onClick={() => setActiveTimeframe(timeframe)}
                className={`flex-1 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
                  activeTimeframe === timeframe ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                {timeframe}
              </button>
            ))}
          </div>
        </div>
        <div className='px-3 mb-2'>
          <div className='flex items-center justify-between mb-2 px-3 pt-2'>
            <div className='flex items-center gap-2'>
              <div
                className='w-8 h-8 rounded-lg flex items-center justify-center'
                style={{
                  background: index?.bgColor || `radial-gradient(circle at 60% 40%, #10b981 60%, #059669 100%)`,
                }}>
                <span className='text-sm'>{index?.icon}</span>
              </div>
              <div className='flex-1'>
                <div className='font-bold text-sm text-gray-800'>{index?.name}</div>
                <div className='text-xs text-gray-500'>Mcap • $80 280 433</div>
              </div>
            </div>
          </div>
        </div>
        {/* Trade Tabs - как в MarketPage с нижней подсветкой */}
        <div className='px-5 mb-2'>
          <div className='flex mb-2 gap-3 justify-start'>
            {['Trade', 'Orders'].map((tab) => {
              const tabKey = tab.toLowerCase();
              return (
                <button
                  key={tabKey}
                  onClick={() => setActiveTradeTab(tabKey)}
                  className={`py-1 px-1 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                    activeTradeTab === tabKey ? 'text-blue-500 border-blue-500' : 'text-gray-400 border-transparent hover:text-blue-400'
                  }`}>
                  {tab}
                </button>
              );
            })}
          </div>
        </div>

        {/* Trade Content - точно как на изображении */}
        <div className='px-5'>
          {activeTradeTab === 'trade' && (
            <div className='space-y-3'>
              {/* Buy/Sell Toggle - уменьшенные контейнеры */}
              <div className='flex bg-gray-100 rounded-lg p-0.5'>
                <button className='flex-1 bg-white shadow-sm rounded-md py-1.5 px-3 text-xs font-medium text-gray-800'>Buy index</button>
                <button className='flex-1 py-1.5 px-3 text-xs font-medium text-gray-500 flex items-center justify-center gap-1'>
                  Sell index
                  <div className='w-1.5 h-1.5 bg-blue-500 rounded-full'></div>
                </button>
              </div>

              <div className='text-xs text-gray-500 font-medium'>BALANCE •10.4 USDT</div>

              {/* Your order field */}
              <div className='space-y-1.5'>
                <div className='relative border-2 border-blue-500 rounded-xl p-2.5'>
                  <label className='absolute -top-2 left-4 bg-white px-1 text-xs text-blue-500 font-medium'>Your order</label>
                  <input
                    type='number'
                    placeholder='Buy tokens'
                    className='w-full text-gray-700 text-sm bg-transparent border-none outline-none placeholder-gray-400'
                    onChange={(e) => setTradeAmount(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Exchange Rate */}
              <div className='text-center'>
                <div className='text-purple-500 font-medium text-sm'>Exchange Rate $0.6202</div>
              </div>

              {/* Price Change Info */}
              <div className='flex items-center justify-center gap-2 text-gray-500 text-xs'>
                <div className='w-3 h-3 border border-gray-400 rounded-full flex items-center justify-center'>
                  <span className='text-xs'>i</span>
                </div>
                <span>Price will change in 2 h 49 m</span>
              </div>

              {/* Buy Button */}
              {address && (
                <button
                  onClick={() => tonConnectUI.sendTransaction(messageAsk)}
                  className='w-full bg-blue-500 text-white font-medium py-1.5 px-4 rounded-xl hover:bg-blue-600 transition-colors text-sm'>
                  Buy for 4.24 USDT
                </button>
              )}
            </div>
          )}

          {activeTradeTab === 'orders' && (
            <div className='space-y-3'>
              {/* Order Book Header */}
              <div className='flex justify-between items-center'>
                <div className='text-xs text-gray-700 font-medium'>Order book • 54 Sellers</div>
                <div className='text-xs text-blue-500 font-medium flex items-center gap-1'>
                  My orders
                  <div className='w-1.5 h-1.5 bg-blue-500 rounded-full'></div>
                </div>
              </div>

              {/* Orders List */}
              <div className='space-y-0'>
                {/* Order Item 1 */}
                <div className='flex items-center justify-between py-3 border-b border-gray-100'>
                  <div className='flex items-center gap-3'>
                    <div className='w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center'>
                      <div className='text-white text-xs font-bold'>CAP</div>
                    </div>
                    <div>
                      <div className='text-sm font-medium text-gray-800'>EQBzcE4-...5qeADBkx</div>
                      <div className='text-xs text-gray-500'>Sell • 243.06 Tokens</div>
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='text-sm font-bold text-gray-800'>$804.20</div>
                    <div className='text-xs text-green-500 font-medium'>USDT</div>
                  </div>
                </div>

                {/* Order Item 2 */}
                <div className='flex items-center justify-between py-3 border-b border-gray-100'>
                  <div className='flex items-center gap-3'>
                    <div className='w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center'>
                      <div className='text-white text-xs font-bold'>CAP</div>
                    </div>
                    <div>
                      <div className='text-sm font-medium text-gray-800'>EQBzcE4-...5qeADBkx</div>
                      <div className='text-xs text-gray-500'>Sell • 123.14 Tokens</div>
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='text-sm font-bold text-gray-800'>$423.16</div>
                    <div className='text-xs text-green-500 font-medium'>USDT</div>
                  </div>
                </div>

                {/* Order Item 3 */}
                <div className='flex items-center justify-between py-3'>
                  <div className='flex items-center gap-3'>
                    <div className='w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center'>
                      <div className='text-white text-xs font-bold'>CAP</div>
                    </div>
                    <div>
                      <div className='text-sm font-medium text-gray-800'>EQBzcE4-...5qeADBkx</div>
                      <div className='text-xs text-gray-500'>Sell • 7307.43 Tokens</div>
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='text-sm font-bold text-gray-800'>$23497.02</div>
                    <div className='text-xs text-green-500 font-medium'>USDT</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTradeTab === 'volume' && (
            <div className='space-y-3'>
              <div className='text-xs text-gray-500 font-medium'>TRADING VOLUME</div>

              {/* Volume Analysis */}
              <div className='space-y-2'>
                <label className='text-xs text-blue-500 font-medium'>Volume Analysis</label>
                <div className='border-2 border-blue-500 rounded-lg p-1'>
                  <div className='text-gray-500 text-xs px-1.5'>24h Volume Data</div>
                </div>
              </div>

              {/* Volume Stats */}
              <div className='grid grid-cols-2 gap-4 text-xs'>
                <div>
                  <div className='text-gray-500 text-xs'>24h Volume</div>
                  <div className='font-medium'>2.4K TON</div>
                </div>
                <div>
                  <div className='text-gray-500 text-xs'>Avg Volume</div>
                  <div className='font-medium'>1.8K TON</div>
                </div>
              </div>

              {/* Volume Level Slider */}
              <div className='space-y-1.5'>
                <div className='flex justify-between text-xs text-gray-500'>
                  <span>Low</span>
                  <span>Medium</span>
                  <span>High</span>
                </div>
                <div className='relative'>
                  <input
                    type='range'
                    min='0'
                    max='100'
                    step='1'
                    defaultValue='60'
                    className='w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer'
                    style={{
                      background: 'linear-gradient(to right, #f59e0b 0%, #f59e0b 60%, #e5e7eb 60%, #e5e7eb 100%)',
                    }}
                  />
                </div>
                <div className='text-center'>
                  <div className='text-xs text-gray-500'>Volume Level: High</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const IndexesPage = () => {
  const { user, getUsername, getUserPhoto } = useTelegram();
  const [activeTab, setActiveTab] = useState('indexes');

  const address = useTonAddress();

  const [indexesData, setIndexesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tonPrice, setTonPrice] = useState(3.0);
  const [popupOpen, setPopupOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [activeBalanceTab, setActiveBalanceTab] = useState('balance'); // 'balance', 'transactions', 'earn'
  const [activeTimeframe, setActiveTimeframe] = useState('All');
  const [activeTradeTab, setActiveTradeTab] = useState('buy');
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState(address || '');
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const navigate = useNavigate();

  // Данные индексов согласно референсу
  const mockIndexesData = [
    {
      id: 'market_cap',
      name: 'Market Cap Index',
      icon: '📊',
      price: '$804.20',
      change: '+30.24%',
      mcap: 'Mcap • $80 280 433',
      bgColor: '#3B82F6',
    },
    {
      id: 'top10_collections',
      name: 'Top 10 collections index',
      icon: '🔟',
      price: '$456.23',
      change: '+0.24%',
      mcap: 'Mcap • $40 290 882',
      bgColor: '#3B82F6',
    },
    {
      id: 'black_gifts',
      name: 'Black gifts index',
      icon: '⚫',
      price: '$56.25',
      change: '+23.25%',
      mcap: 'Mcap • $1 024 723',
      bgColor: '#000000',
    },
    {
      id: 'unique_gifts',
      name: 'Unique gifts index',
      icon: '🦄',
      price: '$103.18',
      change: '+12.68%',
      mcap: 'Mcap • $2 304 263',
      bgColor: '#EC4899',
    },
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      setIndexesData(mockIndexesData);
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const tabs = [
    { id: 'gifts', label: 'My Gifts', active: false },
    { id: 'market', label: 'Market Cap', active: false },
    { id: 'volume', label: 'Volume', active: false },
    { id: 'indexes', label: 'Indexes', active: true },
  ];

  const getChartDataForIndex = (index) => {
    if (!index) return [];

    const days = 7;
    const baseValue = parseFloat(index.price?.replace('$', '') || '100');
    const chartData = [];

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));

      const variation = (Math.random() - 0.5) * 0.2;
      const value = baseValue * (1 + variation);

      chartData.push({
        dt: date.toISOString(),
        value: value,
      });
    }

    return chartData;
  };

  const totalWalletValue = 2435;
  const indexTokens = 2452.02;

  const [tonConnectUI] = useTonConnectUI();
  const sliceAddress = address?.slice(0, 3) + '...' + address?.slice(-2);

  const handleWalletConnect = () => {
    if (walletConnected) {
      setWalletMenuOpen(!walletMenuOpen);
    } else {
      tonConnectUI.openModal();
      setWalletConnected(true);
      setWalletAddress(sliceAddress);
    }
  };
  const handleDisconnect = () => {
    setWalletConnected(false);
    setWalletAddress('');
    setWalletMenuOpen(false);
    tonConnectUI.disconnect();
  };

  if (loading) {
    return (
      <div className='relative min-h-screen bg-white'>
        <div className='overflow-y-auto pb-20 px-4 py-4'>
          <div className='flex justify-center items-center h-64'>
            <div className='text-gray-500'>Loading indexes...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='relative min-h-screen bg-white'>
      <div className='overflow-y-auto pb-20 px-4 py-4' style={{ height: '100vh' }}>
        {/* User Info with TON Connect */}
        <div className='flex justify-between items-center mb-4 gap-2'>
          <div
            className='inline-flex items-center justify-center border border-gray-300 rounded-2xl px-3 py-2 bg-white shadow-sm'
            style={{ width: 'calc(100% - 80px)' }}>
            {getUserPhoto() ? (
              <img
                src={getUserPhoto()}
                alt='User avatar'
                className='w-5 h-5 rounded-full mr-2 object-cover flex-shrink-0'
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : (
              <div className='w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center mr-2 flex-shrink-0'>
                <span className='text-white text-xs font-bold'>{user?.first_name?.[0] || 'T'}</span>
              </div>
            )}
            <div className='w-5 h-5 bg-blue-500 rounded-full items-center justify-center mr-2 hidden'>
              <span className='text-white text-xs font-bold'>{user?.first_name?.[0] || 'T'}</span>
            </div>
            <div className='flex items-center min-w-0 flex-1 overflow-hidden'>
              <span className='text-gray-700 font-bold text-sm whitespace-nowrap'>{getUsername() || 'Tand'}</span>
              <span className='text-gray-700 font-bold text-sm mx-1'>•</span>
              <span className='text-gray-700 font-bold text-sm whitespace-nowrap'>53212 TON</span>
              <span className='text-gray-700 font-bold text-sm mx-1'>•</span>
              <span className='text-orange-500 font-bold text-sm whitespace-nowrap'>🎁 34</span>
            </div>
          </div>

          {/* TON Connect Button with Menu */}
          <div className='relative'>
            <button
              onClick={handleWalletConnect}
              className={`inline-flex items-center justify-center border rounded-2xl px-3 py-4 bg-white shadow-sm transition-colors ${
                walletConnected ? 'border-green-300 hover:border-green-400' : 'border-blue-300 hover:border-blue-400'
              }`}
              style={{ width: '72px', minWidth: '72px', height: '38px' }}>
              {walletConnected ? (
                <span className='text-green-700 font-bold text-xs whitespace-nowrap'>{sliceAddress}</span>
              ) : (
                <svg className='w-4 h-4 text-blue-700' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z'
                  />
                </svg>
              )}
            </button>

            {/* Wallet Menu */}
            {walletConnected && walletMenuOpen && (
              <>
                <div className='fixed inset-0 z-10' onClick={() => setWalletMenuOpen(false)} />
                <div className='absolute right-0 top-12 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-20 min-w-48'>
                  <div className='px-4 py-2 border-b border-gray-100'>
                    <div className='text-sm font-medium text-gray-800'>Wallet Connected</div>
                    <div className='text-xs text-gray-500'>{walletAddress}</div>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(walletAddress);
                      setWalletMenuOpen(false);
                    }}
                    className='w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2'>
                    <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z'
                      />
                    </svg>
                    Copy Address
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className='w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2'>
                    <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1'
                      />
                    </svg>
                    Disconnect
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* One Token Card */}
        <div
          className='bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl p-4 mb-4 text-white relative overflow-hidden mx-auto'
          style={{ maxWidth: '100%' }}>
          <div className='relative z-10'>
            <div className='text-xl font-bold mb-1'>One Token - All Telegram Gifts!</div>
            <div className='text-sm opacity-90 mb-4'>Easy way to invest in Telegram assets market</div>
            <button className='bg-white text-purple-700 font-bold py-2 px-6 rounded-full text-sm hover:bg-gray-100 transition-colors'>
              Exchange Index Tokens
            </button>
          </div>
          {/* Decorative circles */}
          <div className='absolute top-4 right-8 w-32 h-32 border border-white/20 rounded-full'></div>
          <div className='absolute -top-8 -right-8 w-24 h-24 border border-white/10 rounded-full'></div>
        </div>

        {/* Balance/Transactions/Earn Compact Blocks */}
        <div className='bg-gray-100 rounded-xl p-0.5 mb-4 flex'>
          <button
            onClick={() => setActiveBalanceTab('balance')}
            className={`flex-1 py-2 px-3 text-center font-bold text-xs rounded-lg transition-all duration-200 ${
              activeBalanceTab === 'balance' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            Balance
          </button>
          <button
            onClick={() => setActiveBalanceTab('transactions')}
            className={`flex-1 py-2 px-3 text-center font-bold text-xs rounded-lg transition-all duration-200 flex items-center justify-center gap-1 ${
              activeBalanceTab === 'transactions' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <span>Transactions</span>
            {activeBalanceTab === 'transactions' && <div className='w-1.5 h-1.5 bg-blue-500 rounded-full'></div>}
          </button>
          <button
            onClick={() => setActiveBalanceTab('earn')}
            className={`flex-1 py-2 px-3 text-center font-bold text-xs rounded-lg transition-all duration-200 ${
              activeBalanceTab === 'earn' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            Earn
          </button>
        </div>

        {/* Content based on active tab */}
        {activeBalanceTab === 'balance' ? (
          <>
            {/* Wallet Section */}
            <div className='text-center mb-6'>
              <div className='text-gray-500 text-sm mb-3 flex items-center justify-center gap-2 font-bold'>
                Wallet
                <div className='w-4 h-4 bg-gray-300 rounded-full flex items-center justify-center'>
                  <span className='text-xs text-white font-bold'>?</span>
                </div>
              </div>
              <div className='flex items-center justify-center gap-6 mb-3'>
                <button className='w-10 h-10 border-2 border-blue-500 rounded-full flex items-center justify-center text-blue-500 hover:bg-blue-50 transition-colors'>
                  <span className='text-xl font-black'>←</span>
                </button>
                <div className='text-4xl font-bold text-gray-800'>${totalWalletValue.toLocaleString()}</div>
                <button className='w-10 h-10 border-2 border-blue-500 rounded-full flex items-center justify-center text-blue-500 hover:bg-blue-50 transition-colors'>
                  <span className='text-xl font-black'>→</span>
                </button>
              </div>
              <div className='text-gray-500 text-sm'>{indexTokens.toFixed(2)} Index tokens</div>
            </div>

            {/* Indexes Section - только в balance */}
            <div className='mb-4'>
              <div className='text-gray-500 text-xs font-medium mb-3 px-1 uppercase tracking-wide'>INDEXES</div>
              <div className='space-y-2'>
                {indexesData.map((index) => (
                  <div
                    key={index.id}
                    className='flex items-center justify-between py-4 px-4 cursor-pointer hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-200'
                    onClick={() => {
                      setSelectedIndex(index);
                      setPopupOpen(true);
                    }}>
                    <div className='flex items-center flex-1 min-w-0'>
                      <div
                        className='w-12 h-12 rounded-xl flex items-center justify-center mr-4 flex-shrink-0'
                        style={{ backgroundColor: index.bgColor }}>
                        <span className='text-xl'>{index.icon}</span>
                      </div>
                      <div className='min-w-0 flex-1'>
                        <div className='font-semibold text-gray-900 text-base leading-tight truncate'>{index.name}</div>
                        <div className='text-sm text-gray-500 mt-0.5'>{index.mcap}</div>
                      </div>
                    </div>
                    <div className='text-right flex-shrink-0 ml-4'>
                      <div className='text-gray-900 text-lg font-semibold'>{index.price}</div>
                      <div className='text-green-500 text-sm font-medium'>{index.change}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : activeBalanceTab === 'transactions' ? (
          /* Transactions Content */
          <div className='mb-6'>
            <div className='text-gray-500 text-sm mb-4 text-center font-medium'>Recent Transactions</div>
            <div className='space-y-3'>
              {[
                { type: 'Buy', amount: '+150.00', token: 'Market Cap Index', time: '2h ago' },
                { type: 'Sell', amount: '-75.50', token: 'Black gifts index', time: '5h ago' },
                { type: 'Buy', amount: '+200.00', token: 'Unique gifts index', time: '1d ago' },
              ].map((transaction, index) => (
                <div key={index} className='flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl'>
                  <div className='flex items-center flex-1 min-w-0'>
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${
                        transaction.type === 'Buy' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                      }`}>
                      <span className='text-sm font-bold'>{transaction.type === 'Buy' ? '+' : '−'}</span>
                    </div>
                    <div className='min-w-0 flex-1'>
                      <div className='font-medium text-gray-900 text-sm truncate'>{transaction.token}</div>
                      <div className='text-xs text-gray-500 mt-0.5'>{transaction.time}</div>
                    </div>
                  </div>
                  <div className={`font-semibold text-sm flex-shrink-0 ml-3 ${transaction.type === 'Buy' ? 'text-green-600' : 'text-red-600'}`}>
                    ${transaction.amount}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Earn Content */
          <div className='mb-6'>
            <div className='text-center mb-6'>
              <div className='text-gray-500 text-sm mb-3 flex items-center justify-center gap-2 font-bold'>
                Wallet
                <div className='w-4 h-4 bg-gray-300 rounded-full flex items-center justify-center'>
                  <span className='text-xs text-white font-bold'>?</span>
                </div>
              </div>
              <div className='text-4xl font-bold text-gray-800 mb-3'>${totalWalletValue.toLocaleString()}</div>
              <div className='text-gray-500 text-sm mb-4 font-bold'>3453 Frens</div>

              <div className='mb-6'>
                <div className='text-2xl font-black text-gray-800 leading-tight'>
                  Invite friends and <span className='text-purple-500 font-black'>earn</span>
                </div>
                <div className='text-3xl font-black text-blue-500 mt-1'>50% comission!</div>
              </div>

              {/* Stats Row */}
              <div className='flex justify-between mb-6 px-4'>
                <div className='text-center'>
                  <div className='text-xl font-black text-gray-800'>3453</div>
                  <div className='text-xs text-gray-500 font-bold mt-1'>Frens</div>
                </div>
                <div className='text-center'>
                  <div className='text-xl font-black text-gray-800'>$21,234</div>
                  <div className='text-xs text-gray-500 font-bold mt-1'>Earn</div>
                </div>
                <div className='text-center'>
                  <div className='text-xl font-black text-gray-800'>$2,233</div>
                  <div className='text-xs text-gray-500 font-bold mt-1'>Withdraw</div>
                </div>
              </div>

              {/* Invite Link */}
              <div className='mb-6'>
                <div className='relative border-2 border-blue-500 rounded-xl p-4'>
                  <label className='absolute -top-2 left-4 bg-white px-2 text-xs text-blue-500 font-medium'>Invite Link</label>
                  <div className='text-sm text-blue-500 break-all font-medium'>https://t.me/giftindexbot/i3d43123</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className='space-y-3'>
                <button className='w-full bg-blue-500 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-600 transition-colors text-sm'>
                  Share Link
                </button>
                <button className='w-full bg-blue-500 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-600 transition-colors text-sm'>
                  Withdraw
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Popup with chart */}
      <PopupIndexChart
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        index={selectedIndex}
        chartData={selectedIndex ? getChartDataForIndex(selectedIndex) : []}
        currentTonPrice={tonPrice}
      />
    </div>
  );
};

export default IndexesPage;
