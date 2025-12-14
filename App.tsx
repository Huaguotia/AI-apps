import React, { useState } from 'react';
import { ARCanvas } from './components/ARCanvas';
import { Toolbar } from './components/Toolbar';
import { DEFAULT_BRUSH_SIZE, DEFAULT_COLOR } from './constants';
import { ToolMode } from './types';

function App() {
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [brushSize, setBrushSize] = useState<number>(DEFAULT_BRUSH_SIZE);
  const [toolMode, setToolMode] = useState<ToolMode>(ToolMode.DRAW);
  const [clearTrigger, setClearTrigger] = useState<number>(0);

  const handleClear = () => {
    setClearTrigger(prev => prev + 1);
  };

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-slate-900">
      <ARCanvas
        color={color}
        brushSize={brushSize}
        toolMode={toolMode}
        onClearTrigger={clearTrigger}
      />
      
      <Toolbar
        currentColor={color}
        brushSize={brushSize}
        toolMode={toolMode}
        onColorChange={setColor}
        onBrushSizeChange={setBrushSize}
        onToolModeChange={setToolMode}
        onClear={handleClear}
      />
    </div>
  );
}

export default App;