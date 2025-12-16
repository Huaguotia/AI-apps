import React, { useState } from 'react';
import { ARCanvas } from './components/ARCanvas';
import { Toolbar } from './components/Toolbar';
import { DEFAULT_BRUSH_SIZE, DEFAULT_COLOR } from './constants';
import { ToolMode, AppMode } from './types';

function App() {
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [brushSize, setBrushSize] = useState<number>(DEFAULT_BRUSH_SIZE);
  const [toolMode, setToolMode] = useState<ToolMode>(ToolMode.DRAW);
  const [appMode, setAppMode] = useState<AppMode>(AppMode.FREE_DRAW);
  const [clearTrigger, setClearTrigger] = useState<number>(0);
  const [undoTrigger, setUndoTrigger] = useState<number>(0);

  const handleClear = () => {
    setClearTrigger(prev => prev + 1);
  };

  const handleUndo = () => {
    setUndoTrigger(prev => prev + 1);
  };

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-slate-900">
      <ARCanvas
        color={color}
        brushSize={brushSize}
        toolMode={toolMode}
        appMode={appMode}
        onClearTrigger={clearTrigger}
        onUndoTrigger={undoTrigger}
      />
      
      <Toolbar
        currentColor={color}
        brushSize={brushSize}
        toolMode={toolMode}
        appMode={appMode}
        onColorChange={setColor}
        onBrushSizeChange={setBrushSize}
        onToolModeChange={setToolMode}
        onAppModeChange={setAppMode}
        onClear={handleClear}
        onUndo={handleUndo}
      />
    </div>
  );
}

export default App;