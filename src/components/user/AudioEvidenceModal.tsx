import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, Play, Pause, Volume2, ShieldCheck, FileText, CheckCircle2, Lock } from 'lucide-react';
import { AudioEvidenceItem, Incident } from '../../types';
import { playAudioUrl } from '../../services/audioService';

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

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div 
        id="audio-evidence-modal"
        className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl p-5 space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                Audio Evidence Vault
              </h3>
              <p className="text-[11px] text-slate-400">
                Discreet recordings captured automatically during emergency
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Demo audio data banner */}
        <div className="p-3 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-purple-900 font-bold">
            <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Encrypted at rest</span>
          </div>
          <span className="text-[10px] font-mono font-bold bg-purple-200/60 text-purple-800 px-2 py-0.5 rounded-md">
            RA 9262
          </span>
        </div>

        {/* Audio Recordings List */}
        <div className="space-y-3">
          {audioItems.length === 0 ? (
            <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-400">
              No audio evidence stored yet — recordings will appear here during an emergency.
            </div>
          ) : audioItems.map((item) => {
            const isPlaying = playingId === item.id;
            return (
              <div
                key={item.id}
                className="bg-slate-50 rounded-2xl p-4 border border-slate-200/70 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-black text-slate-900">
                      {item.incidentCode}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {item.date} • {item.time}
                    </span>
                  </div>

                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                    item.status === 'RECORDING' 
                      ? 'bg-red-50 text-red-700 border-red-200 animate-pulse' 
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {item.status}
                  </span>
                </div>

                {/* Simulated Waveform & Player */}
                <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center gap-3">
                  <button
                    onClick={() => togglePlay(item.id)}
                    className="w-10 h-10 rounded-xl bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center shrink-0 shadow-xs active:scale-95 transition-all"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    {/* Simulated Waveform Bars */}
                    <div className="flex items-center gap-1 h-7">
                      {[12, 24, 18, 28, 14, 22, 30, 16, 26, 12, 20, 24, 16, 28, 14].map((h, i) => (
                        <div
                          key={i}
                          className={`w-1 rounded-full transition-all duration-300 ${
                            isPlaying && i <= (playbackSeconds % 15)
                              ? 'bg-purple-600 scale-y-110'
                              : 'bg-slate-200'
                          }`}
                          style={{ height: `${h}px` }}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-1">
                      <span>{isPlaying ? `00:${playbackSeconds.toString().padStart(2, '0')}` : '00:00'}</span>
                      <span>{Math.floor(item.durationSeconds / 60)}:{(item.durationSeconds % 60).toString().padStart(2, '0')}</span>
                    </div>
                  </div>
                </div>

                {/* Cryptographic SHA-256 Hash */}
                <div className="text-[10px] text-slate-500 font-mono bg-white p-2 rounded-xl border border-slate-100 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Lock className="w-3 h-3 text-slate-400" />
                    <span className="truncate max-w-[240px]">sha256:{item.sha256Hash}</span>
                  </span>
                  <span className="text-slate-400 font-sans font-semibold">{item.fileSize}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};