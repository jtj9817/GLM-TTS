#!/usr/bin/env python3
# Copyright (c) 2025 Zhipu AI Inc (authors: CogAudio Group Members)
# Improved GLM-TTS Gradio Frontend
# Features: Modern UI, server status, generation history, optimized backend

import os
import sys
import time
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Optional

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import gradio as gr
import torch
import numpy as np

# CUDA optimizations
if torch.cuda.is_available():
    torch.backends.cudnn.benchmark = True
    torch.backends.cuda.matmul.allow_tf32 = True

from transformers import AutoTokenizer, LlamaForCausalLM
from cosyvoice.cli.frontend import TTSFrontEnd, SpeechTokenizer, TextFrontEnd
from utils import tts_model_util, yaml_util
from utils.audio import mel_spectrogram
from llm.glmtts import GLMTTS
from glmtts_inference import (
    get_special_token_ids,
    generate_long,
    DEVICE,
)
from functools import partial
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Configuration ---
CONFIG = {
    "default_sample_rate": 24000,
    "use_fp16": True,
    "output_dir": "outputs/gradio",
    "max_history": 10,
}

# --- Global State ---
class AppState:
    def __init__(self):
        self.frontend: Optional[TTSFrontEnd] = None
        self.text_frontend: Optional[TextFrontEnd] = None
        self.llm: Optional[GLMTTS] = None
        self.flow = None
        self.sample_rate: int = CONFIG["default_sample_rate"]
        self.loaded = False
        self.loading = False
        self.history = []  # List of (timestamp, text, audio_path)

state = AppState()


def get_device_info():
    """Get GPU/device information."""
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        gpu_mem = torch.cuda.get_device_properties(0).total_memory / 1024**3
        return f"GPU: {gpu_name} ({gpu_mem:.1f} GB)"
    return "CPU Mode"


def load_models_internal(sample_rate: int = 24000, progress=gr.Progress()):
    """Load models with progress updates."""
    global state

    if state.loading:
        return "Models are already loading..."

    state.loading = True

    try:
        progress(0.1, desc="Loading Speech Tokenizer...")
        _model, _feature_extractor = yaml_util.load_speech_tokenizer("ckpt/speech_tokenizer")
        speech_tokenizer = SpeechTokenizer(_model, _feature_extractor)

        progress(0.2, desc="Configuring audio processing...")
        if sample_rate == 32000:
            feat_extractor = partial(
                mel_spectrogram, sampling_rate=sample_rate, hop_size=640,
                n_fft=2560, num_mels=80, win_size=2560, fmin=0, fmax=8000, center=False
            )
        else:
            feat_extractor = partial(
                mel_spectrogram, sampling_rate=sample_rate, hop_size=480,
                n_fft=1920, num_mels=80, win_size=1920, fmin=0, fmax=8000, center=False
            )

        progress(0.3, desc="Loading Text Tokenizer...")
        glm_tokenizer = AutoTokenizer.from_pretrained(
            "ckpt/vq32k-phoneme-tokenizer", trust_remote_code=True
        )
        tokenize_fn = lambda text: glm_tokenizer.encode(text)

        progress(0.4, desc="Loading Frontend...")
        state.frontend = TTSFrontEnd(
            tokenize_fn, speech_tokenizer, feat_extractor,
            os.path.join("frontend", "campplus.onnx"),
            os.path.join("frontend", "spk2info.pt"),
            DEVICE,
        )
        state.text_frontend = TextFrontEnd(use_phoneme=True)

        progress(0.5, desc="Loading LLM (this may take a moment)...")
        llama_path = "ckpt/llm"
        state.llm = GLMTTS(
            llama_cfg_path=os.path.join(llama_path, "config.json"),
            mode="PRETRAIN"
        )

        dtype = torch.float16 if CONFIG["use_fp16"] else torch.float32
        state.llm.llama = LlamaForCausalLM.from_pretrained(
            llama_path, torch_dtype=dtype
        ).to(DEVICE)
        state.llm.llama_embedding = state.llm.llama.model.embed_tokens

        special_token_ids = get_special_token_ids(state.frontend.tokenize_fn)
        state.llm.set_runtime_vars(special_token_ids=special_token_ids)

        progress(0.8, desc="Loading Flow model...")
        flow_model = yaml_util.load_flow_model(
            "ckpt/flow/flow.pt", "ckpt/flow/config.yaml", DEVICE
        )
        state.flow = tts_model_util.Token2Wav(flow_model, sample_rate=sample_rate, device=DEVICE)

        state.sample_rate = sample_rate
        state.loaded = True
        state.loading = False

        progress(1.0, desc="Ready!")
        return f"Models loaded successfully! ({get_device_info()}, FP16: {CONFIG['use_fp16']})"

    except Exception as e:
        state.loading = False
        logger.error(f"Failed to load models: {e}")
        import traceback
        traceback.print_exc()
        return f"Error loading models: {str(e)}"


def get_status():
    """Get current status."""
    if state.loading:
        return "Loading models..."
    elif state.loaded:
        return f"Ready | {get_device_info()} | Sample Rate: {state.sample_rate}Hz | FP16: {CONFIG['use_fp16']}"
    else:
        return "Models not loaded. Click 'Load Models' to start."


def synthesize(
    prompt_audio,
    prompt_text,
    input_text,
    seed,
    use_cache,
    progress=gr.Progress()
):
    """Main synthesis function."""
    if not state.loaded:
        raise gr.Error("Models not loaded! Click 'Load Models' first.")

    if not input_text or not input_text.strip():
        raise gr.Error("Please enter text to synthesize.")

    if not prompt_audio:
        raise gr.Error("Please upload a reference audio file.")

    try:
        progress(0.1, desc="Processing reference audio...")

        # Normalize text
        norm_prompt_text = state.text_frontend.text_normalize(prompt_text) + ' ' if prompt_text else ''
        norm_input_text = state.text_frontend.text_normalize(input_text)

        logger.info(f"Synthesizing: {norm_input_text[:50]}...")

        progress(0.2, desc="Extracting speaker features...")

        # Extract features
        prompt_text_token = state.frontend._extract_text_token(norm_prompt_text) if norm_prompt_text else None
        prompt_speech_token = state.frontend._extract_speech_token([prompt_audio])
        speech_feat = state.frontend._extract_speech_feat(prompt_audio, sample_rate=state.sample_rate)
        embedding = state.frontend._extract_spk_embedding(prompt_audio)

        progress(0.4, desc="Preparing generation...")

        # Prepare cache
        cache_speech_token_list = [prompt_speech_token.squeeze().tolist()]
        flow_prompt_token = torch.tensor(cache_speech_token_list, dtype=torch.int32).to(DEVICE)

        cache = {
            'cache_text': [norm_prompt_text] if norm_prompt_text else [],
            'cache_text_token': [prompt_text_token] if prompt_text_token is not None else [],
            'cache_speech_token': cache_speech_token_list,
            'use_cache': use_cache,
        }

        progress(0.5, desc="Generating speech (LLM + Flow)...")

        # Generate
        tts_speech, _, _, _ = generate_long(
            frontend=state.frontend,
            text_frontend=state.text_frontend,
            llm=state.llm,
            flow=state.flow,
            text_info=['gradio', norm_input_text],
            cache=cache,
            embedding=embedding,
            flow_prompt_token=flow_prompt_token,
            speech_feat=speech_feat,
            sample_method="ras",
            seed=int(seed),
            device=DEVICE,
            use_phoneme=False,
        )

        progress(0.9, desc="Finalizing audio...")

        # Convert to numpy (float32 for Gradio 6 compatibility)
        audio_data = tts_speech.squeeze().cpu().numpy()
        audio_data = np.clip(audio_data, -1.0, 1.0).astype(np.float32)

        # Save to history (int16 for file)
        os.makedirs(CONFIG["output_dir"], exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(CONFIG["output_dir"], f"{timestamp}.wav")

        import soundfile as sf
        audio_int16 = (audio_data * 32767.0).astype(np.int16)
        sf.write(output_path, audio_int16, state.sample_rate)

        # Update history
        state.history.insert(0, {
            "timestamp": timestamp,
            "text": input_text[:100] + "..." if len(input_text) > 100 else input_text,
            "path": output_path,
        })
        state.history = state.history[:CONFIG["max_history"]]

        progress(1.0, desc="Done!")
        logger.info(f"Generated audio saved to: {output_path}")

        # Return float32 audio for Gradio 6 playback
        return (state.sample_rate, audio_data), update_history_display()

    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        import traceback
        traceback.print_exc()
        raise gr.Error(f"Synthesis failed: {str(e)}")


def update_history_display():
    """Update history display."""
    if not state.history:
        return "No generation history yet."

    lines = []
    for i, item in enumerate(state.history):
        lines.append(f"{i+1}. [{item['timestamp']}] {item['text']}")
    return "\n".join(lines)


def load_from_history(evt: gr.SelectData):
    """Load audio from history selection."""
    if evt.index < len(state.history):
        item = state.history[evt.index]
        if os.path.exists(item["path"]):
            return item["path"]
    return None


def clear_vram():
    """Clear VRAM and reset models."""
    global state

    if state.llm:
        del state.llm
    if state.flow:
        del state.flow
    if state.frontend:
        del state.frontend

    state.llm = None
    state.flow = None
    state.frontend = None
    state.text_frontend = None
    state.loaded = False

    import gc
    gc.collect()
    torch.cuda.empty_cache()

    return "VRAM cleared. Models unloaded."


# --- Custom CSS ---
CUSTOM_CSS = """
.status-box {
    padding: 10px;
    border-radius: 8px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border: 1px solid #0f3460;
}
.header-text {
    text-align: center;
    margin-bottom: 20px;
}
.generate-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
    font-size: 18px !important;
}
.history-box {
    font-family: monospace;
    font-size: 12px;
}
"""

# --- Build UI ---
def create_ui():
    with gr.Blocks(
        title="GLM-TTS Studio",
        css=CUSTOM_CSS,
    ) as app:

        # Header
        gr.Markdown(
            """
            # GLM-TTS Studio
            ### High-Quality Text-to-Speech with Zero-Shot Voice Cloning
            """,
            elem_classes=["header-text"]
        )

        # Status Bar
        with gr.Row():
            status_display = gr.Textbox(
                value=get_status(),
                label="Status",
                interactive=False,
                elem_classes=["status-box"]
            )

        with gr.Row():
            # Left Column - Inputs
            with gr.Column(scale=1):
                gr.Markdown("### Reference Voice")

                prompt_audio = gr.Audio(
                    label="Upload Reference Audio",
                    sources=["upload", "microphone"],
                    type="filepath",
                    format="wav",
                )

                prompt_text = gr.Textbox(
                    label="Reference Text (what's spoken in the audio)",
                    placeholder="Enter the exact text from the reference audio...",
                    lines=2,
                    value="他当时还跟线下其他的站姐吵架，然后，打架进局子了。"
                )

                gr.Markdown("### Text to Synthesize")

                input_text = gr.Textbox(
                    label="Input Text",
                    placeholder="Enter the text you want to convert to speech...",
                    lines=5,
                    value="你好，我是GLM语音合成系统。很高兴为你服务！"
                )

                with gr.Accordion("Advanced Settings", open=False):
                    with gr.Row():
                        seed = gr.Number(
                            label="Seed",
                            value=42,
                            precision=0,
                            minimum=0,
                            maximum=999999
                        )
                        use_cache = gr.Checkbox(
                            label="Use KV Cache",
                            value=True,
                            info="Faster for long text"
                        )

                    sample_rate_choice = gr.Radio(
                        choices=[24000, 32000],
                        value=24000,
                        label="Sample Rate (Hz)",
                        info="Requires model reload if changed"
                    )

                with gr.Row():
                    load_btn = gr.Button("Load Models", variant="secondary")
                    clear_btn = gr.Button("Clear VRAM", variant="stop")

                generate_btn = gr.Button(
                    "Generate Speech",
                    variant="primary",
                    size="lg",
                    elem_classes=["generate-btn"]
                )

            # Right Column - Output
            with gr.Column(scale=1):
                gr.Markdown("### Output")

                output_audio = gr.Audio(
                    label="Synthesized Speech",
                    type="numpy",
                    format="wav",
                    autoplay=False,
                    streaming=False,
                )

                gr.Markdown("### Generation History")

                history_display = gr.Textbox(
                    label="Recent Generations",
                    value=update_history_display(),
                    lines=8,
                    interactive=False,
                    elem_classes=["history-box"]
                )

        # Footer
        gr.Markdown(
            """
            ---
            **Tips:**
            - Use clear, high-quality reference audio (3-10 seconds)
            - Matching reference text improves voice similarity
            - Different seeds produce different prosody variations
            """,
            elem_classes=["header-text"]
        )

        # --- Event Handlers ---
        load_btn.click(
            fn=load_models_internal,
            inputs=[sample_rate_choice],
            outputs=[status_display],
            show_progress=True
        )

        clear_btn.click(
            fn=clear_vram,
            outputs=[status_display]
        )

        generate_btn.click(
            fn=synthesize,
            inputs=[prompt_audio, prompt_text, input_text, seed, use_cache],
            outputs=[output_audio, history_display],
            show_progress=True
        )

        # Auto-refresh status
        app.load(fn=get_status, outputs=[status_display])

    return app


if __name__ == "__main__":
    import tempfile
    
    # Get absolute paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    # Ensure temp directory exists and is accessible
    gradio_temp = os.path.join(tempfile.gettempdir(), "gradio")
    os.makedirs(gradio_temp, exist_ok=True)
    os.environ["GRADIO_TEMP_DIR"] = gradio_temp
    
    # Paths that Gradio needs to serve files from
    allowed = [
        tempfile.gettempdir(),
        gradio_temp,
        os.path.join(project_root, "examples"),
        os.path.join(project_root, "outputs"),
        "/tmp",
    ]
    
    print(f"Allowed paths for file serving: {allowed}")
    
    app = create_ui()
    app.queue().launch(
        server_name="0.0.0.0",
        server_port=8048,
        inbrowser=False,
        share=False,
        allowed_paths=allowed,
    )
