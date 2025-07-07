import React from 'react';
import { useTelegram } from '../contexts/TelegramContext';
import { openTelegramSettings, openTelegramSettingsAlternative } from '../utils/telegram';

const AuthStatus = ({ children }) => {
  const { isAuthenticated, error, getAuthStatus, getUsername, user, getDebugInfo, isInitializing } = useTelegram();
  
  const status = getAuthStatus();
  const username = getUsername();
  const debugInfo = getDebugInfo();

  // Во время инициализации всегда показываем children (которые покажут скелетоны)
  if (isInitializing) {
    return children;
  }

  // Показываем ошибки только после завершения инициализации
  if (status === 'error' && !isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold mb-4 text-gray-800">Authorization Error</h2>
          <p className="text-gray-600 mb-6">
            Failed to initialize Telegram Web App. Please make sure you're accessing this app through Telegram.
          </p>
          <div className="bg-gray-100 p-4 rounded-lg text-left text-sm">
            <p className="font-semibold mb-2">Debug Information:</p>
            <p>Error: {error}</p>
            <p>Has WebApp: {debugInfo.hasWebApp ? 'Yes' : 'No'}</p>
            <p>Has InitData: {debugInfo.hasInitData ? 'Yes' : 'No'}</p>
            <p>Platform: {debugInfo.platform || 'Unknown'}</p>
          </div>
        </div>
      </div>
    );
  }

  // Показываем ошибку отсутствия username только для ExplorePage
  if (((status === 'no_username') || (status === 'authorized' && isAuthenticated && user && !username)) && 
      !isInitializing && window.location.pathname === '/') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center max-w-sm mx-auto p-6 bg-white rounded-3xl shadow-2xl border border-gray-100">
          <div className="text-5xl mb-4">👤</div>
          <h2 className="text-xl font-bold mb-3 text-gray-800">Username Required</h2>
          <p className="text-gray-600 mb-4 leading-relaxed text-sm">
            You need to set up a <strong>username</strong> in your Telegram account to use this app and access your gifts collection.
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-left">
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-1">
                <span className="text-blue-500 text-xl">📝</span>
              </div>
              <div className="ml-3">
                <h3 className="font-semibold text-blue-800 mb-1 text-sm">How to set username:</h3>
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

          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Current user: {user?.first_name || 'Unknown'} {user?.last_name || ''}</p>
            <p className="text-xs text-gray-400 mb-1">User ID: {user?.id || 'Unknown'}</p>
            <p className="text-xs text-gray-400">Username found: {username || 'None'}</p>
          </div>
        </div>
      </div>
    );
  }

  // Всегда показываем основной интерфейс
  return children;
};

export default AuthStatus;
