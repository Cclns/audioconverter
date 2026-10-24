# Video Audio Extractor (iPhone PWA)

A private, client-side web application designed for iPhone to inspect videos from your Camera Roll and extract uncompressed, lossless **WAV audio** directly on-device.

- **No Xcode required** (Zero 11GB downloads)
- **No Apple Developer account needed** ($0 cost)
- **Never expires** (No 7-day provisioning profile limits)
- **100% Private & Offline** (Audio is decoded entirely inside Safari using Web Audio API; 0 bytes leave your phone)

---

## Features

- **Direct Camera Roll Import:** Tap to pick any video recorded on your iPhone (`.mov`, `.mp4`).
- **Video & Audio Analysis:**
  - Video resolution & dimensions
  - Video duration
  - Original file size
  - Audio channel count (Mono / Stereo)
  - Sample rate (e.g., 44.1 kHz, 48 kHz)
  - Peak volume (in dB)
- **Interactive Retina Waveform:** Visual representation of the audio waveform.
- **Audio Preview:** Built-in audio player to preview the extracted sound.
- **Lossless WAV Export:** High-fidelity 16-bit PCM WAV encoding.
- **Native iOS Share Sheet:** Tap "Save to Files / Share" to send directly to Files, iCloud Drive, Voice Memos, AirDrop, or Messages.

---

## How to Test Locally on Your iPhone Right Now

1. Ensure your Mac and iPhone are connected to the same Wi-Fi network.
2. In your terminal, run:
   ```bash
   ./serve.py
   ```
3. On your iPhone, open **Safari** and navigate to the printed address (e.g. `http://192.168.1.10:8000`).
4. **To install as an app:**
   - Tap the **Share** button (box with an arrow pointing up at the bottom of Safari).
   - Scroll down and tap **"Add to Home Screen"**.
   - Tap **"Add"** in the top right corner.
5. You now have an **Audio Extractor** app icon on your iPhone home screen that opens fullscreen like a native app.

---

## Free Permanent Cloud Hosting (Optional)

If you don't want to run the Python server on your Mac every time, you can host these static files on any free static host in 1 minute:

- **GitHub Pages:** Push this folder to a GitHub repo and turn on Pages in repository settings.
- **Netlify Drop:** Drag and drop this folder onto [app.netlify.com/drop](https://app.netlify.com/drop).
- **Cloudflare Pages:** Connect the repo for free global CDN hosting.

Once hosted on an HTTPS link, the app will be permanently cached offline by the service worker, meaning you can open and use it even in Airplane Mode.
