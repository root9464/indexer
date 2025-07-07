import React from 'react';

const WorkInProgress = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="text-center max-w-md mx-auto">
        <div className="mb-8">
          <div className="relative">
            <div className="w-24 h-24 mx-auto mb-6">
              <div className="relative bg-white rounded-full w-24 h-24 flex items-center justify-center shadow-lg">
                <svg className="w-12 h-12 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle 
                    className="opacity-25" 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="4"
                  ></circle>
                  <path 
                    className="opacity-75" 
                    fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
            </div>
          </div>
        </div>
        
        <h1 className="text-3xl font-light text-gray-800 mb-4">
          Work in Progress
        </h1>
        
        <p className="text-gray-600 text-lg mb-8 leading-relaxed">
          We're building something amazing for you. This page will be available soon.
        </p>
        
        <div className="flex items-center justify-center space-x-2 mb-8">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
        </div>
        
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">
            Expected completion: Coming soon
          </p>
        </div>
      </div>
    </div>
  );
};

export default WorkInProgress;
