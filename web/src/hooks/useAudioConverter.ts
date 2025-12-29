import { useEffect, useState, useRef } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

type ConversionFormat = "wav" | "mp3" | "flac" | "ogg";

export function useAudioConverter() {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  // Load FFmpeg.wasm
  useEffect(() => {
    if (ffmpegRef.current) return; // Already initialized

    const loadFFmpeg = async () => {
      if (loadPromiseRef.current) return loadPromiseRef.current;

      loadPromiseRef.current = (async () => {
        setLoading(true);
        setError(null);

        try {
          const ffmpeg = new FFmpeg();

          // Log progress
          ffmpeg.on("log", ({ message }) => {
            console.log("FFmpeg:", message);
          });

          ffmpeg.on("progress", ({ progress }) => {
            console.log(`FFmpeg progress: ${Math.round(progress * 100)}%`);
          });

          const origin = window.location.origin;
          const baseURL = new URL("/ffmpeg", origin).toString();

          await ffmpeg.load({
            classWorkerURL: new URL("/ffmpeg/worker.js", origin).toString(),
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
            workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, "text/javascript"),
          });

          ffmpegRef.current = ffmpeg;
          setLoaded(true);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to load FFmpeg";
          setError(message);
          console.error("FFmpeg load error:", err);
        } finally {
          setLoading(false);
        }
      })();

      return loadPromiseRef.current;
    };

    void loadFFmpeg();
  }, []);

  const convertAudio = async (
    audioUrl: string,
    format: ConversionFormat
  ): Promise<Blob> => {
    if (!loaded || !ffmpegRef.current) {
      throw new Error("FFmpeg not loaded yet");
    }

    const ffmpeg = ffmpegRef.current;
    const inputFileName = "input.wav";
    const outputFileName = `output.${format}`;

    try {
      // Fetch the audio file
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Write input file to FFmpeg's virtual filesystem
      await ffmpeg.writeFile(inputFileName, uint8Array);

      // Prepare conversion command based on format
      let args: string[] = [];

      switch (format) {
        case "mp3":
          args = [
            "-i", inputFileName,
            "-codec:a", "libmp3lame",
            "-qscale:a", "2", // VBR quality 2 (~190 kbps)
            outputFileName,
          ];
          break;
        case "flac":
          args = [
            "-i", inputFileName,
            "-codec:a", "flac",
            "-compression_level", "8", // High compression (still lossless)
            outputFileName,
          ];
          break;
        case "ogg":
          args = [
            "-i", inputFileName,
            "-codec:a", "libvorbis",
            "-qscale:a", "6", // Quality 6 (~192 kbps)
            outputFileName,
          ];
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      // Execute conversion
      await ffmpeg.exec(args);

      // Read the output file
      const data = await ffmpeg.readFile(outputFileName);

      // Cleanup virtual filesystem
      await ffmpeg.deleteFile(inputFileName);
      await ffmpeg.deleteFile(outputFileName);

      // Determine MIME type
      const mimeTypes: Record<ConversionFormat, string> = {
        wav: "audio/wav",
        mp3: "audio/mpeg",
        flac: "audio/flac",
        ogg: "audio/ogg",
      };

      // Convert to Blob - handle different return types from ffmpeg.readFile
      let blobData: Uint8Array;
      if (data instanceof Uint8Array) {
        blobData = data;
      } else {
        // Convert unknown type to Uint8Array
        const arr = data as unknown as Uint8Array | ArrayBuffer;
        blobData = new Uint8Array(arr instanceof ArrayBuffer ? arr : arr.buffer);
      }

      // Create a proper ArrayBuffer copy for the Blob constructor
      const blobBuffer = new ArrayBuffer(blobData.byteLength);
      new Uint8Array(blobBuffer).set(blobData);
      return new Blob([blobBuffer], { type: mimeTypes[format] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Conversion failed";
      throw new Error(`FFmpeg conversion error: ${message}`);
    }
  };

  const convertToMP3 = async (audioUrl: string): Promise<Blob> => {
    return convertAudio(audioUrl, "mp3");
  };

  const convertToFLAC = async (audioUrl: string): Promise<Blob> => {
    return convertAudio(audioUrl, "flac");
  };

  const convertToOGG = async (audioUrl: string): Promise<Blob> => {
    return convertAudio(audioUrl, "ogg");
  };

  return {
    loaded,
    loading,
    error,
    convertToMP3,
    convertToFLAC,
    convertToOGG,
    convertAudio,
  };
}
