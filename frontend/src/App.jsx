import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import BottomNavBar from './components/BottomNavBar';
import WorkInProgress from './components/WorkInProgress';
import MarketPage from './pages/MarketPage'
import ExplorePage from './pages/ExplorePage';
import PortfolioPage from './pages/PortfolioPage';
import VolumePage from './pages/VolumePage'
import GainersPage from './pages/GainersPage';
import IndexesPage from './pages/IndexesPage';

import './styles/index.css';

function App() {
  return (
          <Router>
            <div className="min-h-screen bg-white pb-16">
              <Routes>
                <Route path="/" element={<Navigate to="/explore" replace />} />
                <Route path="/explore" element={<ExplorePage />} />
                <Route path="/portfolio" element={<PortfolioPage />} />
                <Route path="/market" element={<MarketPage />} />
                <Route path="/indexes" element={<IndexesPage />} />
                <Route path="/gainers" element={<GainersPage />} />
                <Route path="/volume" element={<VolumePage />} />
                <Route path="/resale" element={<WorkInProgress />} />
                <Route path="/trends" element={<WorkInProgress />} />
                <Route path="/test" element={<WorkInProgress />} />
              
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
              <BottomNavBar />
            </div>
          </Router>

  );
}

export default App;
