import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { VideoGrid } from './components/VideoGrid';
import { Dashboard } from './components/Dashboard';
import { AlertList } from './components/AlertList';
import { SettingsPanel } from './components/SettingsPanel';
import { useAppStore } from './store/useAppStore';

function App() {
  const [activeTab, setActiveTab] = useState('monitor');
  const { alerts } = useAppStore();

  const renderContent = () => {
    switch (activeTab) {
      case 'monitor':
        return (
          <div className="h-full bg-primary">
            <VideoGrid />
          </div>
        );
      case 'dashboard':
        return (
          <div className="h-full overflow-y-auto bg-primary">
            <Dashboard />
          </div>
        );
      case 'alerts':
        return (
          <div className="h-full bg-primary">
            <AlertList />
          </div>
        );
      case 'settings':
        return (
          <div className="h-full overflow-y-auto bg-primary">
            <SettingsPanel />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-primary">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        alertCount={alerts.length}
      />
      <main className="flex-1 overflow-hidden">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
