import { useEffect, useState } from 'react';
import { loadConfig } from './utils/config';
import { Config } from './types';
import Generator from './components/Generator';
import ConfigEditor from './components/ConfigEditor';
import './App.css';

function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadConfig().then(c => {
      setConfig(c);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500">Loading config...</div>;
  if (!config) return <div className="flex items-center justify-center h-screen text-red-500">Error loading config</div>;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white shadow px-6 py-4 flex justify-between items-center sticky top-0 z-20">
        <h1 className="text-xl font-bold text-gray-800">Personal Invoice Generator</h1>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="bg-gray-800 text-white px-4 py-2 rounded shadow hover:bg-gray-700 transition-colors"
        >
          {showSettings ? 'Close Settings' : 'Settings'}
        </button>
      </header>
      
      <main className="flex-1">
        {showSettings ? (
          <ConfigEditor 
            config={config} 
            onSave={(newConfig) => {
              setConfig(newConfig);
              setShowSettings(false);
            }}
            onCancel={() => setShowSettings(false)}
          />
        ) : (
          <Generator config={config} />
        )}
      </main>
    </div>
  );
}

export default App;
