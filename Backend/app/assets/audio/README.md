# Pre-recorded audio for tools

Place a short PCM file here so the media tool can return an audio confirmation when an image is generated.

## File

- **Name:** `image_generated_successfully.pcm`
- **Format:** Raw PCM, 16-bit little-endian, mono, **16 kHz** (same as the Live API).
- **Content:** e.g. a voice saying "Image was generated successfully."

If this file is missing, the tool still works; it just won’t return an `audio_b64` blob and the client won’t play anything.

## How to create the file

1. **Record:** Record the phrase in any app, then export as WAV (16 kHz, mono, 16-bit). Convert WAV → raw PCM (strip the 44-byte WAV header) and save as `image_generated_successfully.pcm`.

2. **TTS script:** From the repo root:
   ```bash
   cd Backend
   python scripts/generate_image_ok_audio.py
   ```
   (Requires: `pip install gtts pydub` and ffmpeg for WAV→PCM, or use the script’s fallback.)

3. **Online:** Use a TTS site to generate a 16 kHz mono WAV, then use sox/ffmpeg to convert to raw PCM:
   ```bash
   ffmpeg -i recording.wav -f s16le -acodec pcm_s16le -ar 16000 -ac 1 image_generated_successfully.pcm
   ```
