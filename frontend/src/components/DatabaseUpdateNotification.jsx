import React, { useState, useEffect } from 'react';

const DatabaseUpdateNotification = ({ 
  isVisible, 
  onClose, 
  autoHideDelay = 8000,
  position = 'top' // 'top' или 'bottom'
}) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShow(true);
      
      // Автоматически скрываем уведомление через заданное время
      const timer = setTimeout(() => {
        setShow(false);
        setTimeout(() => {
          onClose?.();
        }, 300); // Даем время на анимацию закрытия
      }, autoHideDelay);

      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [isVisible, autoHideDelay, onClose]);

  if (!isVisible) return null;

  const positionClasses = position === 'top' 
    ? 'top-4' 
    : 'bottom-20'; // bottom-20 чтобы не перекрывать навигацию

  return (
    <div className={`fixed left-1/2 transform -translate-x-1/2 ${positionClasses} z-50 transition-all duration-300 ${
      show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
    }`}>
      <div className="bg-blue-500 text-white px-4 py-3 rounded-lg shadow-lg border border-blue-600 max-w-sm mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0 mr-2">
              {/* Анимированная иконка обновления */}
              <svg 
                className="w-5 h-5 animate-spin text-white" 
                fill="none" 
                viewBox="0 0 24 24"
              >
                <circle 
                  className="opacity-25" 
                  cx="12" 
                  cy="12" 
                  r="10" 
                  stroke="currentColor" 
                  strokeWidth="4"
                />
                <path 
                  className="opacity-75" 
                  fill="currentColor" 
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium">Database Update</p>
              <p className="text-xs opacity-90">Please wait, updating data...</p>
            </div>
          </div>
          
          {/* Кнопка закрытия */}
          <button
            onClick={() => {
              setShow(false);
              setTimeout(() => {
                onClose?.();
              }, 300);
            }}
            className="flex-shrink-0 ml-3 text-white hover:text-blue-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Прогресс бар (декоративный) */}
        <div className="mt-2 w-full bg-blue-400 rounded-full h-1">
          <div 
            className="bg-white h-1 rounded-full transition-all duration-8000 ease-out"
            style={{
              width: show ? '100%' : '0%',
              transitionDuration: `${autoHideDelay}ms`
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default DatabaseUpdateNotification;
