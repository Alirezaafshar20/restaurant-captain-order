import test from 'node:test';
import assert from 'node:assert/strict';
import {
  realtimeSession,
  parseVoiceOffer,
  createVoiceCall,
} from '../lib/realtime.ts';
import { VoiceConnection } from '../lib/voice-connection.ts';
import { aiGuide } from '../lib/ai-guide.ts';

const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
void test('voice configuration exposes only read-only menu consultation and conversational Persian', () => {
  const config = realtimeSession();
  assert.equal(config.model, 'gpt-realtime-2.1');
  assert.deepEqual(
    config.tools.map((tool) => tool.name),
    ['consult_menu'],
  );
  assert.equal(config.audio.input.turn_detection.interrupt_response, true);
  assert.equal(config.audio.input.transcription.language, 'fa');
  assert.match(config.instructions, /می‌تونم/);
  assert.match(config.instructions, /cannot place, cancel or pay/);
  assert.match(config.instructions, /ONLY source/);
  assert.match(config.instructions, /AI assistant, not a human/);
});
void test('voice offer validation rejects oversized and non-audio requests', () => {
  assert.equal(parseVoiceOffer(JSON.stringify({ sdp })), sdp);
  for (const body of [
    '{}',
    'null',
    JSON.stringify({ sdp: 'bad' }),
    JSON.stringify({ sdp: sdp + 'x'.repeat(40000) }),
  ])
    assert.throws(() => parseVoiceOffer(body));
});
void test('voice handshake keeps credentials server-side and never relays provider errors', async () => {
  assert.equal(
    await createVoiceCall(
      sdp,
      'private-test-key',
      'gpt-realtime-2.1',
      async (url, request) => {
        assert.equal(url, 'https://api.openai.com/v1/realtime/calls');
        assert.equal(request.headers.Authorization, 'Bearer private-test-key');
        assert.equal(request.body.get('sdp'), sdp);
        assert.doesNotMatch(request.body.get('session'), /private-test-key/);
        return new Response(sdp);
      },
    ),
    sdp,
  );
  await assert.rejects(
    () =>
      createVoiceCall(
        sdp,
        'private-test-key',
        'gpt-realtime-2.1',
        async () =>
          new Response('private-test-key provider-detail', { status: 401 }),
      ),
    (error) =>
      !error.message.includes('private-test-key') &&
      !error.message.includes('provider-detail'),
  );
});

function harness(getMedia) {
  const originals = new Map(
    [
      'isSecureContext',
      'navigator',
      'document',
      'RTCPeerConnection',
      'fetch',
    ].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const track = {
    enabled: true,
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const events = [],
    results = [],
    states = [],
    errors = [];
  const channel = {
    readyState: 'open',
    close() {
      this.closed = true;
    },
    send(data) {
      events.push(JSON.parse(data));
    },
  };
  let peer;
  class Peer {
    constructor() {
      peer = this;
    }
    addTrack() {}
    createDataChannel() {
      return channel;
    }
    async createOffer() {
      return { type: 'offer', sdp };
    }
    async setLocalDescription() {}
    async setRemoteDescription() {
      channel.onopen();
    }
    close() {
      this.closed = true;
    }
  }
  const set = (key, value) =>
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  set('isSecureContext', true);
  set('navigator', {
    mediaDevices: { getUserMedia: getMedia || (async () => stream) },
  });
  set('document', {
    createElement: () => ({ pause() {}, play: async () => {} }),
  });
  set('RTCPeerConnection', Peer);
  set('fetch', async () => new Response(sdp));
  let lookups = 0;
  const callbacks = {
    state: (value) => states.push(value),
    error: (value) => errors.push(value),
    caption() {},
    user() {},
    result: (value) => results.push(value),
    lookup: async () => {
      lookups++;
      return { text: 'لاته', items: ['latte'] };
    },
  };
  const voice = new VoiceConnection(callbacks);
  return {
    voice,
    track,
    stream,
    events,
    results,
    states,
    errors,
    channel,
    callbacks,
    peer: () => peer,
    lookups: () => lookups,
    restore() {
      voice.stop();
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}
void test('voice mute and end stop every microphone track and close the connection', async () => {
  const h = harness();
  try {
    await h.voice.start();
    assert.equal(h.states.at(-1), 'listening');
    h.voice.setMuted(true);
    assert.equal(h.track.enabled, false);
    h.voice.setMuted(false);
    assert.equal(h.track.enabled, true);
    h.voice.stop();
    assert.equal(h.track.stopped, true);
    assert.equal(h.peer().closed, true);
    assert.equal(h.channel.closed, true);
  } finally {
    h.restore();
  }
});
void test('closing while microphone permission is pending cannot start a late call', async () => {
  let allow;
  const pending = new Promise((resolve) => {
    allow = resolve;
  });
  const h = harness(() => pending);
  try {
    const starting = h.voice.start();
    h.voice.stop();
    allow(h.stream);
    await starting;
    assert.equal(h.track.stopped, true);
    assert.equal(h.peer(), undefined);
  } finally {
    h.restore();
  }
});
void test('duplicate voice tool events run once, and stopped calls cannot render late results', async () => {
  const h = harness();
  const event = {
    type: 'response.done',
    response: {
      status: 'completed',
      output: [
        {
          type: 'function_call',
          name: 'consult_menu',
          call_id: 'lookup_1',
          arguments: JSON.stringify({ request: 'لاته می‌خوام' }),
        },
      ],
    },
  };
  try {
    await h.voice.start();
    await h.voice.handle(event, h.voice.generation);
    await h.voice.handle(event, h.voice.generation);
    assert.equal(h.lookups(), 1);
    assert.equal(h.results.length, 1);
    assert.equal(
      h.events.filter((e) => e.item?.type === 'function_call_output').length,
      1,
    );
    let resolve;
    h.callbacks.lookup = () =>
      new Promise((r) => {
        resolve = r;
      });
    const late = structuredClone(event);
    late.response.output[0].call_id = 'lookup_2';
    const request = h.voice.handle(late, h.voice.generation);
    h.voice.stop();
    resolve({ text: 'late', items: ['espresso'] });
    await request;
    assert.equal(h.results.length, 1);
  } finally {
    h.restore();
  }
});
void test('conversational model framing is used while facts remain in server-owned cards', async () => {
  const run = (reply) =>
    aiGuide(
      'یه لاته می‌خوام',
      [],
      [],
      { apiKey: 'test', model: 'gpt-6-astra' },
      async () =>
        Response.json({
          status: 'completed',
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    intent: 'recommend',
                    itemIds: ['latte'],
                    question: 'none',
                    reply,
                  }),
                },
              ],
            },
          ],
        }),
    );
  const answer = await run('حتماً، لاته رو با هم ببینیم.');
  assert.equal(answer.lead, 'حتماً، لاته رو با هم ببینیم.');
  assert.deepEqual(answer.items, ['latte']);
  assert.match(answer.text, /۲۲۰/);
  const invalid = await run('فقط 100 تومان و 20 کالریه.');
  assert.doesNotMatch(invalid.lead, /100|20|کالری/);
});
