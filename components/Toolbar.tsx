import React from 'react';
import { COLORS, BRUSH_SIZES } from '../constants';
import { ToolMode } from '../types';
import { Eraser, Paintbrush, Trash2, Undo } from 'lucide-react';

interface ToolbarProps {
  currentColor: string;
  brushSize: number;
  toolMode: ToolMode;
  onColorChange: (color: string) => void;
  onBrushSizeChange: (size: number) => void;
  onToolModeChange: (mode: ToolMode) => void;
  onClear: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentColor,
  brushSize,
  toolMode,
  onColorChange,
  onBrushSizeChange,
  onToolModeChange,
  onClear,
}) => {
  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-4 z-50 pointer-events-auto w-[90%] max-w-xl">
      
      {/* Primary Controls Container */}
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl p-4 w-full flex flex-col gap-4 animate-in slide-in-from-bottom-10 fade-in duration-500">
        
        {/* Colors */}
        <div className="flex justify-between items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => {
                onColorChange(color);
                onToolModeChange(ToolMode.DRAW);
              }}
              className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0 ${
                currentColor === color && toolMode === ToolMode.DRAW
                  ? 'border-white scale-110 ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900'
                  : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Select color ${color}`}
            />
          ))}
        </div>

        <div className="h-px bg-slate-700 w-full" />

        {/* Tools & Size */}
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
             <button
              onClick={() => onToolModeChange(ToolMode.DRAW)}
              className={`p-3 rounded-xl transition-all ${
                toolMode === ToolMode.DRAW
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <Paintbrush size={20} />
            </button>
            <button
              onClick={() => onToolModeChange(ToolMode.ERASER)}
              className={`p-3 rounded-xl transition-all ${
                toolMode === ToolMode.ERASER
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/50'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <Eraser size={20} />
            </button>
          </div>

          {/* Size Slider logic represented as dots for simplicity */}
          <div className="flex items-center gap-3 bg-slate-800 rounded-xl px-3 py-2">
            {BRUSH_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => onBrushSizeChange(size)}
                className={`rounded-full transition-all ${
                  brushSize === size ? 'bg-white' : 'bg-slate-500 hover:bg-slate-400'
                }`}
                style={{ width: Math.max(8, size / 2), height: Math.max(8, size / 2) }}
                aria-label={`Select brush size ${size}`}
              />
            ))}
          </div>

          <button
            onClick={onClear}
            className="p-3 rounded-xl bg-slate-800 text-slate-400 hover:bg-red-900/50 hover:text-red-400 transition-all ml-2"
            title="Clear Canvas"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};