/**
 * Audio Streamer Utility for Gemini Live API
 * Handles:
 * 1. Continuous microphone capture -> downsampling to 16kHz 16-bit linear PCM little-endian.
 * 2. Streaming playback of 24kHz 16-bit linear PCM chunks from Gemini Live session.
 * 3. Instant barge-in / interruption cut-off: stops and purges all scheduled audio instantly.
 */

class AudioStreamer {
  constructor() {
    this.inputContext = null;
    this.mediaStream = null;
    this.processorNode = null;
    this.sourceNode = null;

    this.outputContext = null;
    this.nextPlayTime = 0;
    this.scheduledSources = [];
    this.isPlaying = false;

    this.onPlayStart = null;
    this.onPlayEnd = null;
  }

  /**
   * Initializes or resumes the playback AudioContext (24kHz for Gemini Live).
   */
  getPlaybackContext() {
    if (!this.outputContext || this.outputContext.state === 'closed') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      // Many browsers support specifying sampleRate: 24000
      try {
        this.outputContext = new AudioContextClass({ sampleRate: 24000 });
      } catch (e) {
        // Fallback to default sample rate
        this.outputContext = new AudioContextClass();
      }
    }
    if (this.outputContext.state === 'suspended') {
      this.outputContext.resume().catch(() => {});
    }
    return this.outputContext;
  }

  /**
   * Starts continuous microphone capture.
   * @param {Function} onAudioChunk - Callback receiving ArrayBuffer of 16kHz Int16 PCM.
   */
  async startRecording(onAudioChunk) {
    if (this.mediaStream) {
      this.stopRecording();
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.inputContext = new AudioContextClass();
    if (this.inputContext.state === 'suspended') {
      await this.inputContext.resume();
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.mediaStream = stream;
    this.sourceNode = this.inputContext.createMediaStreamSource(stream);

    // Use ScriptProcessorNode for wide browser compatibility and direct sample extraction
    const bufferSize = 4096;
    this.processorNode = this.inputContext.createScriptProcessor(bufferSize, 1, 1);

    const inputSampleRate = this.inputContext.sampleRate;

    this.processorNode.onaudioprocess = (event) => {
      const inputBuffer = event.inputBuffer.getChannelData(0);
      const pcmBuffer = this.downsampleTo16k(inputBuffer, inputSampleRate);
      if (pcmBuffer && pcmBuffer.byteLength > 0) {
        onAudioChunk(pcmBuffer);
      }
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.inputContext.destination);
  }

  /**
   * Downsamples input float audio samples to 16kHz 16-bit signed PCM ArrayBuffer.
   */
  downsampleTo16k(inputData, inputSampleRate) {
    if (!inputData || inputData.length === 0) return null;

    if (inputSampleRate === 16000) {
      const pcm = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return pcm.buffer;
    }

    const ratio = inputSampleRate / 16000;
    const newLength = Math.round(inputData.length / ratio);
    const pcm = new Int16Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const originIdx = Math.round(i * ratio);
      const s = Math.max(-1, Math.min(1, inputData[originIdx] || 0));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm.buffer;
  }

  /**
   * Stops microphone recording and releases media tracks.
   */
  stopRecording() {
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.inputContext && this.inputContext.state !== 'closed') {
      this.inputContext.close().catch(() => {});
      this.inputContext = null;
    }
  }

  /**
   * Enqueues and schedules a 24kHz PCM chunk received from the Gemini Live session.
   * @param {string} base64Pcm - Base64 encoded 24kHz Int16 linear PCM audio.
   */
  enqueueAudioChunk(base64Pcm) {
    if (!base64Pcm) return;

    const ctx = this.getPlaybackContext();
    if (!ctx) return;

    try {
      // Decode Base64 to Uint8Array
      const binaryString = window.atob(base64Pcm);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert 16-bit PCM (little-endian) to Float32
      const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      if (int16.length === 0) return;

      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      // Create audio buffer at 24kHz
      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.copyToChannel(float32, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(now, this.nextPlayTime);
      source.start(startTime);
      this.nextPlayTime = startTime + audioBuffer.duration;

      this.scheduledSources.push(source);

      if (!this.isPlaying) {
        this.isPlaying = true;
        this.onPlayStart?.();
      }

      source.onended = () => {
        const idx = this.scheduledSources.indexOf(source);
        if (idx !== -1) {
          this.scheduledSources.splice(idx, 1);
        }
        if (this.scheduledSources.length === 0) {
          this.isPlaying = false;
          this.onPlayEnd?.();
        }
      };
    } catch (err) {
      console.warn('[AudioStreamer] Error decoding or scheduling chunk:', err);
    }
  }

  /**
   * INSTANT BARGE-IN / INTERRUPTION:
   * Instantly stops all playing and queued audio nodes and resets timing.
   */
  stopAndClear() {
    for (const source of this.scheduledSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Source may have already stopped
      }
    }
    this.scheduledSources = [];

    if (this.outputContext) {
      this.nextPlayTime = this.outputContext.currentTime;
    } else {
      this.nextPlayTime = 0;
    }

    if (this.isPlaying) {
      this.isPlaying = false;
      this.onPlayEnd?.();
    }
  }

  /**
   * Fully closes both input and output audio contexts.
   */
  cleanup() {
    this.stopRecording();
    this.stopAndClear();
    if (this.outputContext && this.outputContext.state !== 'closed') {
      this.outputContext.close().catch(() => {});
      this.outputContext = null;
    }
  }
}

export const audioStreamer = new AudioStreamer();
export default audioStreamer;
