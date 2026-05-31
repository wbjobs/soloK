import { useState, useEffect } from 'react';
import { GameCanvas } from '../components/GameCanvas';
import { HUD } from '../components/HUD';
import { SkillPanel } from '../components/SkillPanel';
import { RecipeBook } from '../components/RecipeBook';
import { MainMenu } from '../components/MainMenu';
import { NotificationToast } from '../components/NotificationToast';
import { useGameStore } from '../store/useGameStore';

export function GamePage() {
  const { gameState, loadPersistentData } = useGameStore();
  const [dimensions, setDimensions] = useState({ width: 1280, height: 720 });

  useEffect(() => {
    loadPersistentData();
    
    const updateDimensions = () => {
      const maxWidth = Math.min(window.innerWidth - 40, 1280);
      const maxHeight = Math.min(window.innerHeight - 40, 720);
      const aspectRatio = 16 / 9;
      
      let width = maxWidth;
      let height = width / aspectRatio;
      
      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }
      
      setDimensions({ width: Math.floor(width), height: Math.floor(height) });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [loadPersistentData]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');
        
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        
        * {
          user-select: none;
        }
      `}</style>
      
      <div className="relative" style={{ width: dimensions.width, height: dimensions.height }}>
        {gameState === 'menu' ? (
          <MainMenu />
        ) : (
          <>
            <GameCanvas width={dimensions.width} height={dimensions.height} />
            <HUD />
          </>
        )}
        
        <SkillPanel />
        <RecipeBook />
        <NotificationToast />
      </div>
    </div>
  );
}
