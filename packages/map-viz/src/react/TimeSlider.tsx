import type { TimeSliderProps } from "../types";

export function TimeSlider({
  minYear,
  maxYear,
  value,
  onChange,
  isPlaying = false,
  onPlayPause,
}: TimeSliderProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-gray-800/90 backdrop-blur rounded-lg shadow-lg">
      {/* Play/Pause Button */}
      {onPlayPause && (
        <button
          onClick={onPlayPause}
          className="p-2 hover:bg-gray-700 rounded-md text-gray-300 transition-colors"
          aria-label={isPlaying ? "Pause animation" : "Play animation"}
        >
          {isPlaying ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 4h3v12H5V4zm7 0h3v12h-3V4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M6.3 2.8A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.8z" />
            </svg>
          )}
        </button>
      )}

      {/* Min Year Label */}
      <span className="text-gray-400 text-sm font-mono w-12">{minYear}</span>

      {/* Range Slider */}
      <input
        type="range"
        min={minYear}
        max={maxYear}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        aria-label="Select year"
      />

      {/* Max Year Label */}
      <span className="text-gray-400 text-sm font-mono w-12">{maxYear}</span>

      {/* Current Year Display */}
      <span className="text-white font-mono text-xl font-bold w-16 text-center tabular-nums">
        {value}
      </span>
    </div>
  );
}
