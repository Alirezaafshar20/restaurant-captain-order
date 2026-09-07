'use client';
import { useEffect, useRef, useState } from 'react';
import { AudioLines, Mic, MicOff, PhoneOff } from 'lucide-react';
import {
  VoiceConnection,
  type VoiceState,
  type VoiceAnswer,
} from '@/lib/voice-connection';

export function VoiceCaptain({
  open,
  disabled,
  onActive,
  onUser,
  onResult,
  lookup,
}: {
  open: boolean;
  disabled: boolean;
  onActive: (active: boolean) => void;
  onUser: (text: string) => void;
  onResult: (answer: VoiceAnswer) => void;
  lookup: (text: string, signal: AbortSignal) => Promise<VoiceAnswer>;
}) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState('');
  const [caption, setCaption] = useState('');
  const [muted, setMuted] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const connection = useRef<VoiceConnection | null>(null);
  const props = useRef({ onActive, onUser, onResult, lookup });
  useEffect(() => {
    props.current = { onActive, onUser, onResult, lookup };
  });
  useEffect(() => {
    const voice = new VoiceConnection({
      state: (value) => {
        setState(value);
        props.current.onActive(!['idle', 'error'].includes(value));
      },
      error: setError,
      caption: setCaption,
      user: (text) => props.current.onUser(text),
      result: (result) => props.current.onResult(result),
      lookup: (text, signal) => props.current.lookup(text, signal),
    });
    connection.current = voice;
    const hide = () => {
      if (document.visibilityState === 'hidden') voice.stop();
    };
    const leave = () => voice.stop();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    return () => {
      voice.stop();
      connection.current = null;
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave);
    };
  }, []);
  useEffect(() => {
    if (!open) {
      connection.current?.stop();
      return;
    }
    const controller = new AbortController();
    void fetch('/api/voice', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) =>
        setConfigured(!!(data as { configured?: boolean }).configured),
      )
      .catch(() => {});
    return () => {
      controller.abort();
      connection.current?.stop();
    };
  }, [open]);
  const active = !['idle', 'error'].includes(state);
  const title =
    state === 'connecting'
      ? 'دارم ارتباط رو برقرار می‌کنم…'
      : muted
        ? 'میکروفون خاموشه'
        : state === 'speaking'
          ? 'راهنمای مویا داره صحبت می‌کنه'
          : state === 'thinking'
            ? 'دارم منو رو بررسی می‌کنم…'
            : active
              ? 'گوش می‌دم، بفرمایین'
              : 'با هم صحبت کنیم';
  return (
    <section
      className={'voice-captain ' + (active ? 'voice-active' : '')}
      aria-label="گفت‌وگوی صوتی با مویا"
    >
      <div className="voice-captain-row">
        <span
          className={
            'voice-orb ' +
            (state === 'speaking' || state === 'listening'
              ? 'voice-moving'
              : '')
          }
          aria-hidden="true"
        >
          <AudioLines size={23} />
        </span>
        <div className="voice-captain-copy">
          <output>{title}</output>
          <small>
            {active
              ? 'هر وقت خواستین می‌تونین حرفم رو قطع کنین.'
              : 'گفت‌وگو با صدای هوش مصنوعی مویا'}
          </small>
        </div>
        {active ? (
          <div className="voice-controls">
            <button
              type="button"
              disabled={state === 'connecting'}
              aria-label={muted ? 'روشن کردن میکروفون' : 'خاموش کردن میکروفون'}
              aria-pressed={muted}
              onClick={() => {
                connection.current?.setMuted(!muted);
                setMuted(!muted);
              }}
            >
              {muted ? <MicOff size={19} /> : <Mic size={19} />}
            </button>
            <button
              type="button"
              className="voice-end"
              aria-label="پایان گفت‌وگوی صوتی"
              onClick={() => connection.current?.stop()}
            >
              <PhoneOff size={19} />
            </button>
          </div>
        ) : (
          <button
            className="voice-start"
            type="button"
            disabled={disabled || configured !== true}
            onClick={() => {
              setMuted(false);
              void connection.current?.start();
            }}
          >
            شروع گفت‌وگو <Mic size={17} />
          </button>
        )}
      </div>
      {!active && (
        <p className="voice-notice">
          {configured === false
            ? 'گفت‌وگوی صوتی برای این نسخه هنوز فعال نشده.'
            : 'با شروع، صداتون برای پاسخ‌گویی به OpenAI فرستاده می‌شه. با بستن این پنجره، میکروفون خاموش می‌شه.'}
        </p>
      )}
      {active && caption && (
        <p className="voice-caption" aria-label="متن پاسخ صوتی">
          {caption}
        </p>
      )}
      {error && (
        <p className="voice-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
