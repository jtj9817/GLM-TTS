#!/bin/bash
# GLM-TTS Gradio Frontend Startup Script
# Usage: ./run_frontend.sh [--port PORT]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT=8048

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --port)
            PORT="$2"
            shift 2
            ;;
        --help)
            echo "GLM-TTS Gradio Frontend"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --port PORT    Server port (default: 8048)"
            echo "  --help         Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "=========================================="
echo "  GLM-TTS Gradio Frontend"
echo "=========================================="
echo "Port:        $PORT"
echo "URL:         http://localhost:$PORT"
echo "Device:      $(python3 -c 'import torch; print("CUDA" if torch.cuda.is_available() else "CPU")' 2>/dev/null || echo 'Unknown')"
echo "=========================================="
echo ""
echo "Note: Click 'Load Models' in the UI to start"
echo ""

# Activate venv and run
source .venv/bin/activate

export PYTHONPATH="$SCRIPT_DIR:$PYTHONPATH"
export CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:-0}"

exec uv run python tools/gradio_frontend.py
