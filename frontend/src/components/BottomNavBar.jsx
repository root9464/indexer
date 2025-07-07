import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import GiftIcon from '../assets/Gift.svg';

const navMap = {
  explore: '/',
  portfolio: '/portfolio',
  indexes: '/indexes',
  resale: '/resale',
  trends: '/trends'
};

// Компонент скелетона для навигационной панели
const BottomNavBarSkeleton = () => (
  <div className="fixed bottom-0 left-0 right-0 bg-white z-50 border-t border-gray-100">
    <div className="grid grid-cols-5 items-center py-1 mx-4">
      {[...Array(5)].map((_, index) => (
        <div key={index} className="flex flex-col items-center py-1 px-3 animate-pulse">
          <div className="h-6 flex items-center justify-center mb-1">
            <div className="w-6 h-6 bg-gray-200 rounded relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
            </div>
          </div>
          <div className="bg-gray-200 rounded h-3 w-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const BottomNavBar = ({ loading = false }) => {
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) {
    return <BottomNavBarSkeleton />;
  }

  // Определяем активный таб по текущему пути
  const activeTab = Object.entries(navMap).find(([_, path]) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  )?.[0] || 'explore';

  const navItems = [
    {
      id: 'explore',
      label: 'Explore',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
    {
      id: 'portfolio',
      label: 'Portfolio',
      icon: (
        <img
          src={GiftIcon}
          alt="Portfolio"
          className="w-6 h-6"
          style={{
            filter: activeTab === 'portfolio'
              ? 'invert(34%) sepia(99%) saturate(749%) hue-rotate(189deg) brightness(97%) contrast(101%)'
              : 'grayscale(1) brightness(0.7)'
          }}
        />
      )
    },
    {
      id: 'indexes',
      label: 'Indexes',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      )
    },
    {
      id: 'resale',
      label: 'Resale',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
      )
    },
    {
      id: 'trends',
      label: 'Trends',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h2l1-2 2 4 1-2h2" />
        </svg>
      )
    }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white z-50">
      <div className="grid grid-cols-5 items-center py-1 mx-4">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(navMap[item.id])}
            className={`flex flex-col items-center py-1 px-3 ${
              activeTab === item.id 
                ? 'text-blue-500' 
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <div className="h-6 flex items-center justify-center">
              {item.icon}
            </div>
            <span className="text-xs mt-1 font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default BottomNavBar;
