---
name: parler-tts-local
description: Local text-to-speech using Parler-TTS on Apple Silicon. Free, private, no API costs.
---

# Parler-TTS Local

Local text-to-speech using Parler-TTS. Runs on Apple Silicon via MPS acceleration.

## Quick Usage

```bash
python3 ~/clawd/skills/parler-tts-local/scripts/parler-tts-cli.py "Hello, this is a test!" /tmp/output.wav
```

## With Custom Voice

Describe the voice you want in natural language:

```bash
python3 ~/clawd/skills/parler-tts-local/scripts/parler-tts-cli.py \
  "Hello, this is a test!" \
  /tmp/output.wav \
  --voice "A deep male voice with a warm, friendly tone and slight British accent"
```

## Voice Description Examples

- `"A warm, friendly male voice with clear enunciation"`
- `"A young female voice with an energetic, upbeat tone"`
- `"A deep, authoritative male voice with a calm demeanor"`
- `"A soft female voice with a gentle, soothing quality"`
- `"An expressive male voice with dramatic emphasis"`

## Model

Uses `parler-tts/parler-tts-mini-v1` by default (faster inference).
For higher quality, edit the script to use `parler-tts/parler-tts-large-v1`.

## Output

- Outputs WAV file to specified path
- Sample rate: 44100 Hz
- Prints output path to stdout

## Dependencies

- parler-tts
- torch (with MPS support)
- transformers
- soundfile

## Integration with OpenClaw

To use as the TTS provider, configure in OpenClaw:

```json5
{
  messages: {
    tts: {
      auto: "always",
      provider: "cli",
      cli: {
        command: "python3",
        args: [
          "/Users/clawdbot/clawd/skills/parler-tts-local/scripts/parler-tts-cli.py",
          "{{Text}}",
          "{{OutputPath}}"
        ]
      }
    }
  }
}
```

## Notes

- First run downloads the model (~500MB for mini, ~2GB for large)
- Model is cached in `~/.cache/huggingface/`
- Runs on MPS (Apple Silicon) automatically
- Falls back to CPU if MPS unavailable
