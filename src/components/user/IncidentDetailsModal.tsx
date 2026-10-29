import React from 'react';
import { Clock, MapPin, Mic, Shield, Users, CheckCircle2 } from 'lucide-react';
import { Incident } from '../../types';
import { Badge, Button, Sheet, Timeline, type BadgeTone } from '../ui';

interface IncidentDetailsModalProps {
  incident: Incident | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenAudioEvidence?: (incident: Incident) => void;
}

const statusTone = (status: string): BadgeTone => {
  switch (status) {
    case 'ACTIVE':
    case 'PENDING':
      return 'danger';
    case 'RESPONDING':
    case 'RESPONDER EN ROUTE':
    case 'ON SCENE':
    case 'WAIT FOR ME':
    case 'ON THE WAY':
      return 'warning';
    case 'RESOLVED':
      return 'success';
    case 'CANCELLED':
      return 'neutral';
    default:
      return 'brand';
  }
};

export const IncidentDetailsModal: React.FC<IncidentDetailsModalProps> = ({
  incident,
  isOpen,
  onClose,
  onOpenAudioEvidence,
}) => {
  if (!isOpen || !incident) return null;

  return (
    <Sheet
      id="incident-details-modal"
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Incident details"
      subtitle={incident.incidentCode}
      footer={
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
          {onOpenAudioEvidence && (
            <Button
              variant="secondary"
              fullWidth
              icon={<Mic size={16} strokeWidth={1.9} />}
              onClick={() => {
                onClose();
                onOpenAudioEvidence(incident);
              }}
            >
              Inspect audio evidence
            </Button>
          )}
          <Button variant="primary" fullWidth onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Status + summary */}
        <div className="rounded-card bg-[var(--surface-sunken)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone={statusTone(incident.status)}>{incident.status}</Badge>
            <span className="font-mono text-[11px] text-muted">
              {incident.date} · {incident.timeActivated}
            </span>
          </div>
          <p className="t-body mt-2.5 text-muted">
            {incident.notes ||
              'Emergency squeeze trigger activated on wearable thigh band. Telemetry dispatched via cellular network.'}
          </p>
        </div>

        {/* Location */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
            <MapPin size={16} strokeWidth={1.9} className="text-brand-600" />
            Incident location
          </p>
          <div className="rounded-card border border-[rgba(11,27,51,.05)] p-3.5 dark:border-white/[.08]">
            <p className="text-[13px] font-extrabold text-ink">{incident.location.address}</p>
            <p className="t-body text-muted">
              {incident.location.barangay}, {incident.location.city}, {incident.location.country}
            </p>
            <p className="mt-1 break-all font-mono text-[10px] text-muted">
              {incident.location.lat.toFixed(6)}° N, {incident.location.lng.toFixed(6)}° E (±
              {incident.location.accuracyRadiusMeters}m)
            </p>
          </div>
        </div>

        {/* Telemetry grid */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Metric label="GPS status" value={incident.gpsStatus} tone="success" />
          <Metric label="Audio status" value={incident.audioStatus} />
          <Metric label="Comms" value={incident.communicationStatus} tone="brand" />
        </div>

        {/* Contacts & authorities */}
        <div className="space-y-2 rounded-card border border-brand-200 bg-brand-50 p-3.5">
          <FlagRow
            icon={<Users size={15} strokeWidth={1.9} />}
            label="Trusted contacts notified"
            done={incident.trustedContactsNotified}
            doneLabel="Notified"
          />
          <FlagRow
            icon={<Shield size={15} strokeWidth={1.9} />}
            label="Authorities dispatched"
            done={incident.authoritiesNotified}
            doneLabel="Dispatched"
          />
        </div>

        {/* Responder */}
        {incident.assignedResponder && (
          <div className="rounded-card border border-[rgba(11,27,51,.05)] p-3.5 dark:border-white/[.08]">
            <p className="t-caption mb-2 text-muted">Assigned responder unit</p>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-extrabold text-ink">
                  {incident.assignedResponder.name}
                </p>
                <p className="t-body truncate text-muted">{incident.assignedResponder.unit}</p>
              </div>
              <Badge tone="brand">ETA {incident.assignedResponder.eta}</Badge>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div>
          <p className="mb-3 flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
            <Clock size={16} strokeWidth={1.9} className="text-muted" />
            Incident event timeline
          </p>
          <Timeline steps={incident.timeline} />
        </div>
      </div>
    </Sheet>
  );
};

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'brand' }) {
  return (
    <div className="rounded-ctl bg-[var(--surface-sunken)] px-3 py-2.5">
      <p className="t-caption text-muted">{label}</p>
      <p
        className={
          'truncate text-[13px] font-extrabold ' +
          (tone === 'success' ? 'text-success' : tone === 'brand' ? 'text-brand-600' : 'text-ink')
        }
      >
        {value}
      </p>
    </div>
  );
}

function FlagRow({
  icon,
  label,
  done,
  doneLabel,
}: {
  icon: React.ReactNode;
  label: string;
  done: boolean;
  doneLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="t-body flex min-w-0 items-center gap-1.5 text-brand-700">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={
          'flex shrink-0 items-center gap-1 text-[12px] font-extrabold ' +
          (done ? 'text-success' : 'text-muted')
        }
      >
        {done ? (
          <>
            <CheckCircle2 size={14} strokeWidth={2.2} />
            {doneLabel}
          </>
        ) : (
          'Pending'
        )}
      </span>
    </div>
  );
}
