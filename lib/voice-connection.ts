export type VoiceState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';
export type VoiceAnswer = {
  text: string;
  items?: string[];
  lead?: string;
  followUp?: { text: string; choices: string[] };
  mode?: 'ai' | 'menu' | 'fallback';
};
type Callbacks = {
  state: (state: VoiceState) => void;
  error: (message: string) => void;
  caption: (text: string) => void;
  user: (text: string) => void;
  lookup: (text: string, signal: AbortSignal) => Promise<VoiceAnswer>;
  result: (answer: VoiceAnswer) => void;
};

type RealtimeEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
  error?: { code?: string };
  response?: {
    status?: string;
    output?: {
      type?: string;
      name?: string;
      call_id?: string;
      arguments?: string;
    }[];
  };
};

// This connection has no order, payment, profile-write or staff-dispatch capability.
export class VoiceConnection {
  private callbacks: Callbacks;
  private pc?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private stream?: MediaStream;
  private audio?: HTMLAudioElement;
  private abort?: AbortController;
  private deadline?: ReturnType<typeof setTimeout>;
  private connectingTimeout?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private turn = 0;
  private handled = new Set<string>();
  private caption = '';
  private muted = false;
  constructor(callbacks: Callbacks) {
    this.callbacks = callbacks;
  }

  stop() {
    this.generation++;
    this.abort?.abort();
    this.abort = undefined;
    clearTimeout(this.deadline);
    clearTimeout(this.connectingTimeout);
    this.channel?.close();
    this.pc?.close();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
    }
    this.channel = undefined;
    this.pc = undefined;
    this.stream = undefined;
    this.audio = undefined;
    this.handled.clear();
    this.callbacks.state('idle');
  }
  private fail(message: string) {
    this.stop();
    this.callbacks.error(message);
    this.callbacks.state('error');
  }
  setMuted(value: boolean) {
    this.muted = value;
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !value;
    });
  }
  private send(event: unknown) {
    if (this.channel?.readyState === 'open')
      this.channel.send(JSON.stringify(event));
  }
  async start() {
    this.stop();
    const generation = this.generation;
    this.callbacks.error('');
    this.callbacks.caption('');
    this.callbacks.state('connecting');
    this.muted = false;
    this.abort = new AbortController();
    try {
      if (
        !globalThis.isSecureContext ||
        !navigator.mediaDevices?.getUserMedia ||
        !globalThis.RTCPeerConnection
      )
        throw new Error(
          'این مرورگر امکان تماس صوتی رو نداره. از Chrome یا Safari به‌روز و آدرس امن سایت استفاده کنین.',
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      // Permission can resolve after the guest has closed the dialog.
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.connectingTimeout = setTimeout(() => {
        if (generation === this.generation)
          this.fail(
            'برقراری تماس طول کشید. لطفاً اتصال اینترنت رو بررسی و دوباره امتحان کنین.',
          );
      }, 35000);
      const pc = new RTCPeerConnection();
      this.pc = pc;
      const audio = document.createElement('audio');
      audio.autoplay = true;
      this.audio = audio;
      pc.ontrack = (event) => {
        if (generation !== this.generation) return;
        audio.srcObject = event.streams[0] || new MediaStream([event.track]);
        void audio.play().catch(() => {
          if (generation === this.generation)
            this.fail(
              'مرورگر پخش صدا رو اجازه نداد. دوباره دکمهٔ شروع گفت‌وگو رو بزنین.',
            );
        });
      };
      pc.onconnectionstatechange = () => {
        if (generation !== this.generation) return;
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState))
          this.fail(
            'ارتباط صوتی قطع شد و میکروفون خاموش شد. می‌تونین دوباره تماس بگیرین.',
          );
      };
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const channel = pc.createDataChannel('oai-events');
      this.channel = channel;
      channel.onopen = () => {
        if (generation !== this.generation) return;
        clearTimeout(this.connectingTimeout);
        this.callbacks.state('listening');
        this.deadline = setTimeout(
          () => {
            if (generation === this.generation) {
              this.stop();
              this.callbacks.error(
                'این گفت‌وگوی ده‌دقیقه‌ای تموم شد. هر وقت خواستین می‌تونین دوباره شروع کنین.',
              );
            }
          },
          10 * 60 * 1000,
        );
        this.send({
          type: 'response.create',
          response: {
            instructions:
              'Greet the guest once in conversational Persian, clearly introducing yourself as MOYA AI assistant. Ask how you can help. Do not call a tool for this greeting.',
          },
        });
      };
      channel.onmessage = (event) => {
        if (generation !== this.generation) return;
        try {
          void this.handle(JSON.parse(String(event.data)), generation).catch(
            () => {
              if (generation === this.generation)
                this.fail(
                  'ارتباط راهنمای صوتی قطع شد. می‌تونین از منو یا کاپیتان کمک بگیرین.',
                );
            },
          );
        } catch {
          /* Ignore malformed transport events. */
        }
      };
      channel.onerror = () => {
        if (generation === this.generation)
          this.fail('ارتباط صوتی قطع شد. لطفاً دوباره امتحان کنین.');
      };
      channel.onclose = () => {
        if (generation === this.generation)
          this.fail('گفت‌وگوی صوتی پایان یافت و میکروفون خاموش شد.');
      };
      const offer = await pc.createOffer();
      if (generation !== this.generation) return;
      await pc.setLocalDescription(offer);
      if (generation !== this.generation) return;
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: offer.sdp }),
        signal: this.abort.signal,
      });
      if (generation !== this.generation) return;
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          data.error || 'تماس برقرار نشد. لطفاً دوباره امتحان کنین.',
        );
      }
      const sdp = await response.text();
      if (generation !== this.generation) return;
      await pc.setRemoteDescription({ type: 'answer', sdp });
    } catch (error) {
      if (generation !== this.generation) return;
      const name = error instanceof Error ? error.name : '';
      this.fail(
        name === 'NotAllowedError'
          ? 'اجازهٔ میکروفون داده نشد. می‌تونین از تنظیمات مرورگر فعالش کنین یا پیامتون رو بنویسین.'
          : name === 'NotFoundError'
            ? 'میکروفونی پیدا نشد. اتصال میکروفون رو بررسی کنین.'
            : error instanceof Error
              ? error.message
              : 'تماس برقرار نشد.',
      );
    }
  }

  private async handle(event: RealtimeEvent, generation: number) {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        this.turn++;
        this.callbacks.state('listening');
        break;
      case 'input_audio_buffer.speech_stopped':
        this.callbacks.state('thinking');
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (typeof event.transcript === 'string' && event.transcript.trim())
          this.callbacks.user(event.transcript.slice(0, 1500));
        break;
      case 'response.created':
        this.caption = '';
        this.callbacks.caption('');
        this.callbacks.state('thinking');
        break;
      case 'response.output_audio_transcript.delta':
        this.caption = (this.caption + String(event.delta || '')).slice(
          0,
          2000,
        );
        this.callbacks.caption(this.caption);
        break;
      case 'output_audio_buffer.started':
        this.callbacks.state('speaking');
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        this.callbacks.state('listening');
        break;
      case 'error':
        // Provider details can contain internal configuration; show a bounded message.
        if (event.error?.code !== 'response_cancel_not_active')
          this.fail(
            'سرویس صوتی نتونست گفت‌وگو رو ادامه بده. می‌تونین پیامتون رو بنویسین.',
          );
        break;
      case 'response.done': {
        if (event.response?.status === 'failed') {
          this.fail('پاسخ صوتی آماده نشد. لطفاً دوباره امتحان کنین.');
          return;
        }
        const calls = (
          Array.isArray(event.response?.output) ? event.response.output : []
        ).filter((item) => item.type === 'function_call');
        if (!calls.length) return;
        const turn = this.turn;
        let answered = false;
        for (const call of calls.slice(0, 3)) {
          if (
            typeof call.call_id !== 'string' ||
            this.handled.has(call.call_id)
          )
            continue;
          this.handled.add(call.call_id);
          this.callbacks.state('thinking');
          let result: VoiceAnswer;
          try {
            const args = JSON.parse(call.arguments || '{}');
            if (
              call.name !== 'consult_menu' ||
              typeof args.request !== 'string' ||
              !args.request.trim() ||
              args.request.length > 500
            )
              throw new Error('invalid_tool');
            result = await this.callbacks.lookup(
              args.request,
              this.abort!.signal,
            );
          } catch {
            result = {
              text: 'منو رو نتونستم بررسی کنم. لطفاً از منوی روی صفحه یا کاپیتان کمک بگیرین.',
              items: [],
              mode: 'fallback',
            };
          }
          if (generation !== this.generation) return;
          this.send({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: call.call_id,
              output: JSON.stringify(result),
            },
          });
          if (turn === this.turn) {
            this.callbacks.result(result);
            answered = true;
          }
        }
        // Do not resurrect a response the guest interrupted while the menu was loading.
        if (answered && turn === this.turn)
          this.send({ type: 'response.create' });
        break;
      }
    }
  }
}
