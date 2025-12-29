import { useEffect, useRef, useState } from "react";

interface Props {
  audioUrl: string;
  width?: number;
  height?: number;
  barColor?: string;
  backgroundColor?: string;
}

export function WaveformVisualizer({
  audioUrl,
  width = 800,
  height = 120,
  barColor = "#667eea",
  backgroundColor = "rgba(0, 0, 0, 0.2)",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioContext] = useState<AudioContext | null>(() => {
    try {
      return new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!audioUrl) return;

    const loadWaveform = async () => {
      setLoading(true);
      setError(null);

      try {
        const ctx = audioContext || new (window.AudioContext || (window as any).webkitAudioContext)();

        // Fetch and decode audio
        const response = await fetch(audioUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        // Extract channel data
        const rawData = audioBuffer.getChannelData(0); // Mono or left channel

        // Downsample to 1000 samples for performance
        const samples = 1000;
        const blockSize = Math.floor(rawData.length / samples);
        const filtered: number[] = [];

        for (let i = 0; i < samples; i++) {
          let blockSum = 0;
          const start = i * blockSize;
          const end = Math.min(start + blockSize, rawData.length);

          for (let j = start; j < end; j++) {
            blockSum += Math.abs(rawData[j]!);
          }

          filtered.push(blockSum / (end - start));
        }

        setWaveformData(filtered);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load waveform";
        setError(message);
        console.error("Waveform error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadWaveform();
  }, [audioUrl, audioContext]);

  useEffect(() => {
    if (!waveformData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Calculate dimensions
    const barCount = waveformData.length;
    const barWidth = width / barCount;
    const gap = Math.max(0.5, barWidth * 0.1); // 10% gap between bars
    const actualBarWidth = Math.max(1, barWidth - gap);
    const maxAmplitude = Math.max(...waveformData);

    // Draw waveform
    ctx.fillStyle = barColor;

    waveformData.forEach((value, i) => {
      // Normalize and scale bar height (use sqrt for better visual dynamic range)
      const normalizedValue = value / maxAmplitude;
      const barHeight = Math.pow(normalizedValue, 0.7) * height * 0.9;

      const x = i * barWidth;
      const y = (height - barHeight) / 2; // Center vertically

      // Draw rounded bar
      const radius = Math.min(actualBarWidth / 2, 2);
      ctx.beginPath();
      ctx.roundRect(x, y, actualBarWidth, barHeight, radius);
      ctx.fill();
    });
  }, [waveformData, width, height, barColor, backgroundColor]);

  if (loading) {
    return (
      <div
        className="waveform-placeholder"
        style={{ width: "100%", height: `${height}px` }}
      >
        <div className="waveform-loading">Loading waveform...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="waveform-placeholder"
        style={{ width: "100%", height: `${height}px` }}
      >
        <div className="waveform-error">Could not load waveform</div>
      </div>
    );
  }

  return (
    <div className="waveform-container" style={{ width: "100%" }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="waveform-canvas"
      />
    </div>
  );
}
