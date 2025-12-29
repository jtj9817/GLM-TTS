#!/bin/bash
# GLM-TTS Optimized Server Startup Script
# Usage: ./run_optimized_server.sh [--port PORT] [--no-fp16]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Default values
PORT=8049
USE_FP16=1

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --port)
            PORT="$2"
            shift 2
            ;;
        --no-fp16)
            USE_FP16=0
            shift
            ;;
        --help)
            echo "GLM-TTS Optimized Server"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --port PORT    Server port (default: 8049)"
            echo "  --no-fp16      Disable FP16 inference (use FP32)"
            echo "  --help         Show this help message"
            echo ""
            echo "API Endpoints:"
            echo "  GET  /health              Health check"
            echo "  POST /synthesize          Generate audio (returns WAV file)"
            echo "  POST /synthesize_base64   Generate audio (returns base64)"
            echo "  GET  /clear_cache         Clear speaker embedding cache"
            echo ""
            echo "Example curl:"
            echo '  curl -X POST http://localhost:8049/synthesize \'
            echo '    -F "text=Hello world" \'
            echo '    -F "speaker_audio=@reference.wav" \'
            echo '    -F "speaker_text=Reference text" \'
            echo '    --output output.wav'
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "=========================================="
echo "  GLM-TTS Optimized Inference Server"
echo "=========================================="
echo "Port:        $PORT"
echo "FP16:        $([ $USE_FP16 -eq 1 ] && echo 'Enabled' || echo 'Disabled')"
echo "Device:      $(python3 -c 'import torch; print("CUDA" if torch.cuda.is_available() else "CPU")')"
echo "=========================================="

# Activate venv and run
source .venv/bin/activate

# Set environment variables
export PYTHONPATH="$SCRIPT_DIR:$PYTHONPATH"
export CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:-0}"

# Modify config via environment if needed
if [ $USE_FP16 -eq 0 ]; then
    export GLMTTS_USE_FP16=0
fi

# Run the server
exec uv run python tools/optimized_server.py
