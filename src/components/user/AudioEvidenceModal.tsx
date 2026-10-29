import React, { useState, useEffect, useRef } from 'react';
import { Mic, Play, Pause, ShieldCheck, Lock } from 'lucide-react';
import { AudioEvidenceItem, Incident } from '../../types';
import { playAudioUrl } from '../../services/audioService';
import { Badge, Button, Sheet, EmptyState } from '../ui';

interface AudioEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioItems: AudioEvidenceItem[];
  selectedIncident?: Incident | null;
}

export const AudioEvidenceModal: React.FC<AudioEvidenceModalProps> = ({
  isOpen,
  onClose,
  audioItems,
  selectedIncident,
}) => {
  // Playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
  };

  // Stop playback when the modal closes or unmounts.
  useEffect(() => {
    return () => stopAudio();
  }, []);

  useEffect(() => {
    if (!isOpen) stopAudio();
  }, [isOpen]);

  useEffect(() => {
    let interval: any;
    if (playingId) {
      interval = setInterval(() => {
        setPlaybackSeconds((prev) => (prev >= 45 ? 0 : prev + 1));
      }, 1000);
    } else {
      setPlaybackSeconds(0);
    }
    return () => clearInterval(interval);
  }, [playingId]);

  const togglePlay = (id: string) => {
    // Tapping the play button auto-plays the recording (real audio). Tap again to stop.
    if (playingId === id) {
      stopAudio();
      setPlayingId(null);
      return;
    }
    stopAudio();
    setPlayingId(id);
    setPlaybackSeconds(0);
    const item = audioItems.find((a) => a.id === id);
    if (item?.audioUrl) {
      audioElRef.current = playAudioUrl(item.audioUrl, true);
    }
  };

  return (
    <Sheet
      id="audio-evidence-modal"
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Audio evidence vault"
      subtitle="Discreet recordings captured automatically during an emergency"
    >
      <div className="mb-4 flex items-center justify-between gap-3 rounded-card border border-brand-200 bg-brand-50 px-3.5 py-3">
        <span className="flex items-center gap-2 text-[12px] font-extrabold text-brand-700">
          <ShieldCheck size={16} strokeWidth={1.9} />
          Encrypted at rest
        </span>
        <Badge tone="brand">RA 9262</Badge>
      </div>

      {audioItems.length === 0 ? (
        <EmptyState
          icon={<Mic size={24} strokeWidth={1.7} />}
          title="No recordings yet"
          description="Recordings appear here automatically while an emergency is active."
        />
      ) : (
        <ul className="space-y-3">
          {audioItems.map((item) => {
            const isPlaying = playingId === item.id;
            return (
              <li
                key={item.id}
                className="space-y-3 rounded-card border border-[rgba(11,27,51,.05)] bg-[var(--surface-sunken)] p-4 dark:border-white/[.08]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[13px] font-extrabold text-ink">
                      {item.incidentCode}
                    </p>
                    <p className="t-body text-muted">
                      {item.date} · {item.time}
                    </p>
                  </div>
                  <Badge tone={item.status === 'RECORDING' ? 'danger' : 'success'}>
                    {item.status}
                  </Badge>
                </div>

                {/* Player */}
                <div className="flex items-center gap-3 rounded-field border border-[rgba(11,27,51,.05)] bg-[var(--surface)] p-3 dark:border-white/[.08]">
                  <button
                    type="button"
                    onClick={() => togglePlay(item.id)}
                    aria-label={isPlaying ? `Stop ${item.incidentCode}` : `Play ${item.incidentCode}`}
                    className="press grid h-11 w-11 shrink-0 place-items-center rounded-field bg-brand-600 text-white transition-colors duration-[160ms] hover:bg-brand-700"
                  >
                    {isPlaying ? (
                      <Pause size={17} strokeWidth={1.9} />
                    ) : (
                      <Play size={17} strokeWidth={1.9} className="ml-0.5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex h-7 items-center gap-1">
                      {[12, 24, 18, 28, 14, 22, 30, 16, 26, 12, 20, 24, 16, 28, 14].map((h, i) => (
                        <span
                          key={i}
                          className={
                            'w-1 rounded-full transition-[transform,background-color] duration-[240ms] ' +
                            (isPlaying && i <= playbackSeconds % 15
                              ? 'scale-y-110 bg-brand-600'
                              : 'bg-[rgba(11,27,51,.14)] dark:bg-white/20')
                          }
                          style={{ height: `${h}px` }}
                        />
                      ))}
                    </div>
                    <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-muted">
                      <span>{isPlaying ? `00:${playbackSeconds.toString().padStart(2, '0')}` : '00:00'}</span>
                      <span>
                        {Math.floor(item.durationSeconds / 60)}:
                        {(item.durationSeconds % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* SHA-256 hash */}
                <div className="flex items-center justify-between gap-2 rounded-ctl border border-[rgba(11,27,51,.05)] bg-[var(--surface)] px-3 py-2 dark:border-white/[.08]">
                  <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-muted">
                    <Lock size={12} strokeWidth={2} className="shrink-0" />
                    <span className="truncate">sha256:{item.sha256Hash}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-bold text-muted">{item.fileSize}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selectedIncident && (
        <p className="t-body mt-4 text-muted">
          Showing evidence for <span className="font-mono font-bold text-ink">{selectedIncident.incidentCode}</span>.
        </p>
      )}

      <div className="mt-5">
        <Button variant="secondary" fullWidth onClick={onClose}>
          Close
        </Button>
      </div>
    </Sheet>
  );
};
