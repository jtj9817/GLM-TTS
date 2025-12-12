#!/usr/bin/env python3
"""
GLM-TTS Client - Easy interface for the optimized server API

Usage:
    # As a module
    from tools.tts_client import TTSClient

    client = TTSClient()
    client.synthesize(
        text="Hello world",
        speaker_audio="reference.wav",
        output_path="output.wav"
    )

    # As a CLI
    python tools/tts_client.py --text "Hello" --speaker reference.wav --output out.wav
"""

import argparse
import base64
import requests
from pathlib import Path
from typing import Optional, Union


class TTSClient:
    """Client for GLM-TTS optimized server."""

    def __init__(self, base_url: str = "http://localhost:8049"):
        self.base_url = base_url.rstrip("/")

    def health(self) -> dict:
        """Check server health."""
        response = requests.get(f"{self.base_url}/health")
        response.raise_for_status()
        return response.json()

    def is_ready(self) -> bool:
        """Check if server is ready."""
        try:
            health = self.health()
            return health.get("status") == "healthy"
        except:
            return False

    def synthesize(
        self,
        text: str,
        speaker_audio: Union[str, Path],
        output_path: Optional[Union[str, Path]] = None,
        speaker_text: str = "",
        seed: int = 42,
    ) -> bytes:
        """
        Synthesize speech from text.

        Args:
            text: Text to synthesize
            speaker_audio: Path to reference audio file
            output_path: Optional path to save output WAV
            speaker_text: Text spoken in reference audio (improves quality)
            seed: Random seed for reproducibility

        Returns:
            Audio bytes (WAV format)
        """
        speaker_audio = Path(speaker_audio)
        if not speaker_audio.exists():
            raise FileNotFoundError(f"Speaker audio not found: {speaker_audio}")

        with open(speaker_audio, "rb") as f:
            files = {"speaker_audio": (speaker_audio.name, f, "audio/wav")}
            data = {
                "text": text,
                "speaker_text": speaker_text,
                "seed": seed,
            }

            response = requests.post(
                f"{self.base_url}/synthesize",
                files=files,
                data=data,
            )

        response.raise_for_status()
        audio_bytes = response.content

        if output_path:
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(audio_bytes)
            print(f"Saved to: {output_path}")

        return audio_bytes

    def synthesize_base64(
        self,
        text: str,
        speaker_audio: Union[str, Path],
        speaker_text: str = "",
        seed: int = 42,
    ) -> tuple[bytes, int]:
        """
        Synthesize speech and return as decoded bytes with sample rate.

        Returns:
            Tuple of (audio_bytes, sample_rate)
        """
        speaker_audio = Path(speaker_audio)
        if not speaker_audio.exists():
            raise FileNotFoundError(f"Speaker audio not found: {speaker_audio}")

        with open(speaker_audio, "rb") as f:
            files = {"speaker_audio": (speaker_audio.name, f, "audio/wav")}
            data = {
                "text": text,
                "speaker_text": speaker_text,
                "seed": seed,
            }

            response = requests.post(
                f"{self.base_url}/synthesize_base64",
                files=files,
                data=data,
            )

        response.raise_for_status()
        result = response.json()

        audio_bytes = base64.b64decode(result["audio_base64"])
        sample_rate = result["sample_rate"]

        return audio_bytes, sample_rate

    def clear_cache(self) -> dict:
        """Clear the speaker embedding cache."""
        response = requests.get(f"{self.base_url}/clear_cache")
        response.raise_for_status()
        return response.json()


def main():
    parser = argparse.ArgumentParser(description="GLM-TTS Client")
    parser.add_argument("--text", "-t", required=True, help="Text to synthesize")
    parser.add_argument("--speaker", "-s", required=True, help="Path to reference audio")
    parser.add_argument("--speaker-text", default="", help="Text in reference audio")
    parser.add_argument("--output", "-o", default="output.wav", help="Output path")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--url", default="http://localhost:8049", help="Server URL")

    args = parser.parse_args()

    client = TTSClient(args.url)

    # Check server
    if not client.is_ready():
        print(f"Error: Server not ready at {args.url}")
        print("Start the server with: ./run_optimized_server.sh")
        return 1

    print(f"Synthesizing: '{args.text[:50]}...' " if len(args.text) > 50 else f"Synthesizing: '{args.text}'")

    client.synthesize(
        text=args.text,
        speaker_audio=args.speaker,
        speaker_text=args.speaker_text,
        output_path=args.output,
        seed=args.seed,
    )

    return 0


if __name__ == "__main__":
    exit(main())
