import React from 'react';
import { X, Clock, MapPin, Radio, Mic, Shield, Users, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { Incident } from '../../types';

interface IncidentDetailsModalProps {
  incident: Incident | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenAudioEvidence?: (incident: Incident) => void;
}

export const IncidentDetailsModal: React.FC<IncidentDetailsModalProps> = ({
  incident,
  isOpen,
  onClose,
  onOpenAudioEvidence,
}) => {
  if (!isOpen || !incident) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'RESPONDING':
      case 'RESPONDER EN ROUTE':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'WAIT FOR ME':
      case 'ON THE WAY':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'RESOLVED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'CANCELLED':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div 
        id="incident-details-modal"
        className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl p-5 space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono text-slate-400 font-bold block">
                {incident.incidentCode}
              </span>
              <h3 className="font-extrabold text-slate-900 text-sm">
                Incident Details
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Pill & Summary */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-black uppercase px-2.5 py-1 rounded-full border ${getStatusBadge(incident.status)}`}>
              {incident.status}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {incident.date} • {incident.timeActivated}
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed pt-1">
            {incident.notes || 'Emergency squeeze trigger activated on wearable thigh band. Telemetry dispatched via cellular network.'}
          </p>
        </div>

        {/* Location & GPS Info */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 text-slate-800 font-bold">
            <MapPin className="w-4 h-4 text-blue-600" />
            <span>Incident Location</span>
          </div>
          <div className="p-3 rounded-2xl bg-white border border-slate-200/80 text-xs">
            <span className="font-bold text-slate-900 block">{incident.location.address}</span>
            <span className="text-slate-500 block">{incident.location.barangay}, {incident.location.city}, {incident.location.country}</span>
            <span className="font-mono text-[10px] text-slate-400 block mt-1">
              Coordinates: {incident.location.lat.toFixed(6)}° N, {incident.location.lng.toFixed(6)}° E (±{incident.location.accuracyRadiusMeters}m)
            </span>
          </div>
        </div>

        {/* Status Telemetry Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] text-slate-400 block font-bold uppercase">GPS Status</span>
            <span className="font-bold text-emerald-600 block">{incident.gpsStatus}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] text-slate-400 block font-bold uppercase">Audio Status</span>
            <span className="font-bold text-purple-700 block">{incident.audioStatus}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 col-span-2 sm:col-span-1">
            <span className="text-[10px] text-slate-400 block font-bold uppercase">Comms</span>
            <span className="font-bold text-blue-600 block">{incident.communicationStatus}</span>
          </div>
        </div>

        {/* Authorities & Contacts Status */}
        <div className="p-3 rounded-2xl bg-blue-50/60 border border-blue-100 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span>Trusted Contacts Notified:</span>
            </span>
            <span className="font-bold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {incident.trustedContactsNotified ? 'Notified' : 'Pending'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              <span>Authorities Dispatched:</span>
            </span>
            <span className="font-bold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {incident.authoritiesNotified ? 'Dispatched' : 'Pending'}
            </span>
          </div>
        </div>

        {/* Assigned Responder (if available) */}
        {incident.assignedResponder && (
          <div className="p-3 rounded-2xl bg-white border border-slate-200/80 text-xs space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
              Assigned Responder Unit
            </span>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-extrabold text-slate-900 block">{incident.assignedResponder.name}</span>
                <span className="text-slate-500 text-[11px]">{incident.assignedResponder.unit}</span>
              </div>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                ETA: {incident.assignedResponder.eta}
              </span>
            </div>
          </div>
        )}

        {/* Full Step-by-Step Incident Timeline */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Incident Event Timeline</span>
          </h4>

          <div className="space-y-2.5 pl-1">
            {incident.timeline.map((step, idx) => (
              <div key={step.id || idx} className="flex items-start gap-2.5 text-xs">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  ✓
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">{step.title}</span>
                    <span className="text-[10px] font-mono text-slate-400">{step.timestamp}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          {onOpenAudioEvidence && (
            <button
              onClick={() => {
                onClose();
                onOpenAudioEvidence(incident);
              }}
              className="text-xs font-bold text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-3 py-2 rounded-xl transition-all flex items-center gap-1.5"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Inspect Audio Evidence</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="ml-auto px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};