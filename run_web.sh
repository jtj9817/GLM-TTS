#!/bin/bash
# GLM-TTS Web Frontend Startup Script
# Usage: ./run_web.sh [--port PORT]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/web"

PORT=3000

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --port)
            PORT="$2"
            shift 2
            ;;
        --help)
            echo "GLM-TTS Web Frontend"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --port PORT    Server port (default: 3000)"
            echo "  --help         Show this help message"
            echo ""
            echo "Note: Start the backend first with ./run_optimized_server.sh"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "=========================================="
echo "  GLM-TTS Web Frontend"
echo "=========================================="
echo "Port:        $PORT"
echo "URL:         http://localhost:$PORT"
echo "Backend:     http://localhost:8049"
echo "=========================================="
echo ""
echo "Note: Make sure the backend server is running!"
echo "      Start it with: ./run_optimized_server.sh"
echo ""

export PORT=$PORT
exec bun dev
