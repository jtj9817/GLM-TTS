# Copyright (c) 2025 Zhipu AI Inc (authors: CogAudio Group Members)
# Optimized GLM-TTS Inference Server
# Features: FP16, pre-loading, speaker cache, CUDA optimizations, FastAPI

import os
import sys
import hashlib
import tempfile
import logging
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import torch
import numpy as np
import torchaudio

# CUDA optimizations - set before importing models
torch.backends.cudnn.benchmark = True
torch.backends.cuda.matmul.allow_tf32 = True
torch.backends.cudnn.allow_tf32 = True

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from cosyvoice.cli.frontend import TTSFrontEnd, SpeechTokenizer, TextFrontEnd
from utils import tts_model_util, yaml_util
from utils.audio import mel_spectrogram
from transformers import AutoTokenizer, LlamaForCausalLM
from llm.glmtts import GLMTTS
from glmtts_inference import (
    get_special_token_ids,
    generate_long,
    DEVICE,
)
from functools import partial

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# --- Configuration ---
CONFIG = {
    "sample_rate": 24000,
    "use_fp16": True,
    "use_torch_compile": False,  # Set True for PyTorch 2.x optimization (slower first run)
    "max_speaker_cache": 50,
    "host": "0.0.0.0",
    "port": 8049,
}

# --- Global State ---
class ModelState:
    def __init__(self):
        self.frontend: Optional[TTSFrontEnd] = None
        self.text_frontend: Optional[TextFrontEnd] = None
        self.llm: Optional[GLMTTS] = None
        self.flow = None
        self.loaded = False
        self.speaker_cache = {}

state = ModelState()


def load_optimized_models(sample_rate=24000, use_fp16=True, use_compile=False):
    """
    Load models with optimizations:
    - FP16 inference for LLM
    - CUDA optimizations
    - Optional torch.compile
    """
    logger.info(f"Loading models with FP16={use_fp16}, sample_rate={sample_rate}")

    # Load Speech Tokenizer
    logger.info("[1/5] Loading Speech Tokenizer...")
    _model, _feature_extractor = yaml_util.load_speech_tokenizer("ckpt/speech_tokenizer")
    speech_tokenizer = SpeechTokenizer(_model, _feature_extractor)

    # Configure feature extractor based on sample rate
    if sample_rate == 32000:
        feat_extractor = partial(
            mel_spectrogram, sampling_rate=sample_rate, hop_size=640,
            n_fft=2560, num_mels=80, win_size=2560, fmin=0, fmax=8000, center=False
        )
    else:  # 24000
        feat_extractor = partial(
            mel_spectrogram, sampling_rate=sample_rate, hop_size=480,
            n_fft=1920, num_mels=80, win_size=1920, fmin=0, fmax=8000, center=False
        )

    # Load tokenizer
    logger.info("[2/5] Loading Text Tokenizer...")
    glm_tokenizer = AutoTokenizer.from_pretrained(
        "ckpt/vq32k-phoneme-tokenizer", trust_remote_code=True
    )
    tokenize_fn = lambda text: glm_tokenizer.encode(text)

    # Load Frontend
    logger.info("[3/5] Loading Frontend...")
    frontend = TTSFrontEnd(
        tokenize_fn,
        speech_tokenizer,
        feat_extractor,
        os.path.join("frontend", "campplus.onnx"),
        os.path.join("frontend", "spk2info.pt"),
        DEVICE,
    )
    text_frontend = TextFrontEnd(use_phoneme=True)

    # Load LLM with FP16
    logger.info("[4/5] Loading LLM...")
    llama_path = "ckpt/llm"
    llm = GLMTTS(
        llama_cfg_path=os.path.join(llama_path, "config.json"),
        mode="PRETRAIN"
    )

    # Use FP16 for faster inference and lower VRAM
    dtype = torch.float16 if use_fp16 else torch.float32
    llm.llama = LlamaForCausalLM.from_pretrained(
        llama_path, torch_dtype=dtype
    ).to(DEVICE)

    # Optional: torch.compile for PyTorch 2.x
    if use_compile and hasattr(torch, 'compile'):
        logger.info("Applying torch.compile to LLM...")
        llm.llama = torch.compile(llm.llama, mode="reduce-overhead")

    llm.llama_embedding = llm.llama.model.embed_tokens
    special_token_ids = get_special_token_ids(frontend.tokenize_fn)
    llm.set_runtime_vars(special_token_ids=special_token_ids)

    # Load Flow model
    logger.info("[5/5] Loading Flow model...")
    flow_model = yaml_util.load_flow_model(
        "ckpt/flow/flow.pt", "ckpt/flow/config.yaml", DEVICE
    )
    flow = tts_model_util.Token2Wav(flow_model, sample_rate=sample_rate, device=DEVICE)

    logger.info("All models loaded successfully!")
    return frontend, text_frontend, llm, flow


def get_speaker_cache_key(audio_path: str) -> str:
    """Generate cache key from file content hash."""
    with open(audio_path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def get_or_extract_speaker(audio_path: str, frontend: TTSFrontEnd, sample_rate: int):
    """Get cached speaker features or extract new ones."""
    cache_key = get_speaker_cache_key(audio_path)

    if cache_key in state.speaker_cache:
        logger.info(f"Using cached speaker embedding: {cache_key[:8]}...")
        return state.speaker_cache[cache_key]

    logger.info(f"Extracting new speaker embedding: {cache_key[:8]}...")
    speaker_data = {
        "speech_token": frontend._extract_speech_token([audio_path]),
        "speech_feat": frontend._extract_speech_feat(audio_path, sample_rate=sample_rate),
        "embedding": frontend._extract_spk_embedding(audio_path),
    }

    # Cache management - remove oldest if full
    if len(state.speaker_cache) >= CONFIG["max_speaker_cache"]:
        oldest_key = next(iter(state.speaker_cache))
        del state.speaker_cache[oldest_key]

    state.speaker_cache[cache_key] = speaker_data
    return speaker_data


# --- FastAPI Lifespan ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load models on startup."""
    logger.info("Starting optimized GLM-TTS server...")

    state.frontend, state.text_frontend, state.llm, state.flow = load_optimized_models(
        sample_rate=CONFIG["sample_rate"],
        use_fp16=CONFIG["use_fp16"],
        use_compile=CONFIG["use_torch_compile"],
    )
    state.loaded = True

    logger.info(f"Server ready at http://{CONFIG['host']}:{CONFIG['port']}")
    yield

    # Cleanup
    logger.info("Shutting down...")
    del state.llm
    del state.flow
    torch.cuda.empty_cache()


# --- FastAPI App ---
app = FastAPI(
    title="GLM-TTS Optimized Server",
    description="High-performance TTS inference with voice cloning",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy" if state.loaded else "loading",
        "device": str(DEVICE),
        "fp16": CONFIG["use_fp16"],
        "speaker_cache_size": len(state.speaker_cache),
    }


@app.post("/synthesize")
async def synthesize(
    text: str = Form(..., description="Text to synthesize"),
    speaker_audio: UploadFile = File(..., description="Reference voice audio"),
    speaker_text: str = Form("", description="Text spoken in reference audio"),
    seed: int = Form(42, description="Random seed for reproducibility"),
    sample_method: str = Form("ras", description="Sampling strategy: ras or topk"),
    top_k: int = Form(25, description="Top-k for sampling"),
    top_p: float = Form(0.8, description="Top-p for nucleus sampling (RAS)"),
    temperature: float = Form(1.0, description="Sampling temperature (RAS)"),
    min_token_text_ratio: float = Form(2.0, description="Minimum generation length ratio"),
    max_token_text_ratio: float = Form(20.0, description="Maximum generation length ratio"),
    use_cache: bool = Form(True, description="Use prompt/history cache for long text"),
    use_phoneme: bool = Form(False, description="Enable phoneme-in (G2P) processing"),
):
    """
    Synthesize speech from text using a reference voice.

    Returns: WAV audio file
    """
    if not state.loaded:
        raise HTTPException(status_code=503, detail="Models still loading")

    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    sample_method = sample_method.lower().strip()
    if sample_method not in {"ras", "topk"}:
        raise HTTPException(status_code=400, detail="sample_method must be 'ras' or 'topk'")
    if top_k < 1 or top_k > 200:
        raise HTTPException(status_code=400, detail="top_k must be between 1 and 200")
    if not (0.0 < top_p <= 1.0):
        raise HTTPException(status_code=400, detail="top_p must be in (0, 1]")
    if temperature <= 0:
        raise HTTPException(status_code=400, detail="temperature must be > 0")
    if min_token_text_ratio <= 0 or max_token_text_ratio <= 0:
        raise HTTPException(status_code=400, detail="token_text_ratio values must be > 0")
    if min_token_text_ratio > max_token_text_ratio:
        raise HTTPException(status_code=400, detail="min_token_text_ratio must be <= max_token_text_ratio")

    try:
        # Save uploaded audio to temp file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            content = await speaker_audio.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Get or extract speaker features
        speaker_data = get_or_extract_speaker(
            tmp_path, state.frontend, CONFIG["sample_rate"]
        )

        # Normalize text
        norm_speaker_text = state.text_frontend.text_normalize(speaker_text) + " " if speaker_text else ""
        norm_text = state.text_frontend.text_normalize(text)

        # Prepare tokens
        prompt_text_token = state.frontend._extract_text_token(norm_speaker_text) if norm_speaker_text else None

        cache_speech_token_list = [speaker_data["speech_token"].squeeze().tolist()]
        flow_prompt_token = torch.tensor(cache_speech_token_list, dtype=torch.int32).to(DEVICE)

        # Build cache
        cache = {
            "cache_text": [norm_speaker_text] if norm_speaker_text else [],
            "cache_text_token": [prompt_text_token] if prompt_text_token is not None else [],
            "cache_speech_token": cache_speech_token_list,
            "use_cache": use_cache,
        }

        # Generate audio
        tts_speech, _, _, _ = generate_long(
            frontend=state.frontend,
            text_frontend=state.text_frontend,
            llm=state.llm,
            flow=state.flow,
            text_info=["api_request", norm_text],
            cache=cache,
            embedding=speaker_data["embedding"],
            flow_prompt_token=flow_prompt_token,
            speech_feat=speaker_data["speech_feat"],
            sample_method=sample_method,
            seed=seed,
            device=DEVICE,
            sampling=top_k,
            top_p=top_p,
            temperature=temperature,
            min_token_text_ratio=min_token_text_ratio,
            max_token_text_ratio=max_token_text_ratio,
            use_phoneme=use_phoneme,
        )

        # Save output
        output_path = tempfile.mktemp(suffix=".wav")
        torchaudio.save(output_path, tts_speech.cpu(), CONFIG["sample_rate"])

        # Cleanup input temp file
        os.unlink(tmp_path)

        return FileResponse(
            output_path,
            media_type="audio/wav",
            filename="synthesized.wav",
            background=None,  # Don't delete immediately
        )

    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/synthesize_base64")
async def synthesize_base64(
    text: str = Form(...),
    speaker_audio: UploadFile = File(...),
    speaker_text: str = Form(""),
    seed: int = Form(42),
    sample_method: str = Form("ras"),
    top_k: int = Form(25),
    top_p: float = Form(0.8),
    temperature: float = Form(1.0),
    min_token_text_ratio: float = Form(2.0),
    max_token_text_ratio: float = Form(20.0),
    use_cache: bool = Form(True),
    use_phoneme: bool = Form(False),
):
    """
    Synthesize speech and return as base64-encoded WAV.
    Useful for web applications.
    """
    import base64

    # Reuse the main synthesize logic
    response = await synthesize(
        text=text,
        speaker_audio=speaker_audio,
        speaker_text=speaker_text,
        seed=seed,
        sample_method=sample_method,
        top_k=top_k,
        top_p=top_p,
        temperature=temperature,
        min_token_text_ratio=min_token_text_ratio,
        max_token_text_ratio=max_token_text_ratio,
        use_cache=use_cache,
        use_phoneme=use_phoneme,
    )

    # Read the file and encode
    with open(response.path, "rb") as f:
        audio_bytes = f.read()

    # Cleanup
    os.unlink(response.path)

    return JSONResponse({
        "audio_base64": base64.b64encode(audio_bytes).decode("utf-8"),
        "sample_rate": CONFIG["sample_rate"],
    })


@app.get("/clear_cache")
async def clear_speaker_cache():
    """Clear the speaker embedding cache."""
    count = len(state.speaker_cache)
    state.speaker_cache.clear()
    torch.cuda.empty_cache()
    return {"message": f"Cleared {count} cached speakers"}


if __name__ == "__main__":
    uvicorn.run(
        "optimized_server:app",
        host=CONFIG["host"],
        port=CONFIG["port"],
        reload=False,
        workers=1,  # Single worker for GPU model
    )
