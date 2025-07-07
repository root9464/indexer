import React from 'react';

// Компонент скелетона для страницы подписки
const SubscriptionSkeleton = () => (
  <div className="h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-50 flex items-center justify-center p-4 overflow-hidden">
    <div className="max-w-sm w-full bg-white rounded-3xl shadow-2xl p-5 text-center -mt-12 animate-pulse">
      {/* Header Skeleton */}
      <div className="mb-4">
        <div className="bg-purple-200 rounded-lg h-8 w-32 mx-auto mb-2 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-200 via-purple-100 to-purple-200 animate-shimmer"></div>
        </div>
        <div className="bg-purple-100 rounded-lg h-6 w-40 mx-auto relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-100 via-purple-50 to-purple-100 animate-shimmer"></div>
        </div>
      </div>

      {/* Gift Box Icon Skeleton */}
      <div className="mb-5 flex justify-center">
        <div className="w-20 h-20 bg-gray-200 rounded-full relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
        </div>
      </div>

      {/* Unlock text Skeleton */}
      <div className="mb-4">
        <div className="bg-gray-200 rounded-lg h-6 w-48 mx-auto mb-3 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
        </div>
      </div>

      {/* Features list Skeleton */}
      <div className="space-y-2 mb-5 text-left">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="flex items-center">
            <div className="w-6 h-6 bg-blue-200 rounded-full mr-3 flex-shrink-0 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-200 via-blue-100 to-blue-200 animate-shimmer"></div>
            </div>
            <div className="bg-gray-200 rounded h-4 flex-1 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Buttons Skeleton */}
      <div className="space-y-2">
        <div className="w-full bg-blue-200 rounded-xl h-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-200 via-blue-100 to-blue-200 animate-shimmer"></div>
        </div>
        <div className="w-full bg-gray-100 rounded-xl h-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 animate-shimmer"></div>
        </div>
      </div>
    </div>
  </div>
);

const SubscriptionRequiredPage = ({ onCheckAgain, loading = false }) => {
  if (loading) {
    return <SubscriptionSkeleton />;
  }

  return (
    <div className="h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-50 flex items-center justify-center p-4 overflow-hidden">
      <div className="max-w-sm w-full bg-white rounded-3xl shadow-2xl p-5 text-center -mt-12">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-3xl font-bold text-purple-600 mb-2">
            Beta Test
          </h1>
          <p className="text-xl text-purple-500 leading-relaxed">
            available only<br />
            for subcribers
          </p>
        </div>

        {/* Gift Box Icon */}
        <div className="mb-5 flex justify-center">
          <div className="text-7xl">
            🎁
          </div>
        </div>

        {/* Unlock text */}
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gray-800 mb-3">
            Unlock the <span className="text-purple-600">Full Experience!</span>
          </h2>
        </div>

        {/* Features list */}
        <div className="space-y-2 mb-5 text-left">
          <div className="flex items-center">
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-gray-700 text-lg">Gift portfolio evaluation</span>
          </div>
          
          <div className="flex items-center">
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-gray-700 text-lg">Market Analysis</span>
          </div>
          
          <div className="flex items-center">
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-gray-700 text-lg">Trends and Signals</span>
          </div>
          
          <div className="flex items-center">
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-gray-700 text-lg">Resale Dashboard</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-2">
          <button
            onClick={() => {
              window.open('https://t.me/giftindex', '_blank');
            }}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 shadow-lg text-lg"
          >
            Subscribe to Channel
          </button>
          
          <button
            onClick={onCheckAgain}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-colors duration-200 text-lg"
          >
            Check
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionRequiredPage;
