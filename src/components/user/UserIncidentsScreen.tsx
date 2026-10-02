import React, { useState } from 'react';
import {
  Clock,
  MapPin,
  ChevronRight,
  ChevronDown,
  Check,
  Filter,
  FileText,
  History,
} from 'lucide-react';
import { Incident } from '../../types';
import { IncidentDetailsModal } from './IncidentDetailsModal';
import { Badge, GlassCard, EmptyState, type BadgeTone } from '../ui';

interface UserIncidentsScreenProps {
  incidents: Incident[];
  onOpenAudioEvidence?: (incident: Incident) => void;
}

type FilterKey = 'ALL' | 'ACTIVE' | 'RESOLVED';

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All alerts' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'RESOLVED', label: 'Resolved' },
];

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

export const UserIncidentsScreen: React.FC<UserIncidentsScreenProps> = ({
  incidents,
  onOpenAudioEvidence,
}) => {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  const filteredIncidents = incidents.filter((inc) => {
    if (filter === 'ALL') return true;
    if (filter === 'ACTIVE')
      return (
        inc.status === 'ACTIVE' ||
        inc.status === 'PENDING' ||
        inc.status === 'RESPONDING' ||
        inc.status === 'RESPONDER EN ROUTE'
      );
    if (filter === 'RESOLVED') return inc.status === 'RESOLVED' || inc.status === 'CANCELLED';
    return true;
  });

  return (
    <div id="user-incidents-screen" className="space-y-4 pb-6">
      {/* Header + glass filter menu */}
      <header className="flex items-center justify-between gap-3">
        <h2 className="t-heading flex items-center gap-2 text-ink">
          <FileText size={18} strokeWidth={1.9} className="text-brand-600" />
          Alerts
        </h2>

        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterMenuOpen((v) => !v)}
            aria-expanded={filterMenuOpen}
            aria-haspopup="menu"
            className="glass press flex min-h-[38px] items-center gap-1.5 rounded-field px-3 text-[12px] font-bold text-ink"
          >
            <Filter size={14} strokeWidth={2} className="text-brand-600" />
            <span>{FILTER_OPTIONS.find((o) => o.key === filter)?.label}</span>
            <ChevronDown
              size={14}
              strokeWidth={2.2}
              className={'text-muted transition-transform duration-[160ms] ' + (filterMenuOpen ? 'rotate-180' : '')}
            />
          </button>

          {filterMenuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setFilterMenuOpen(false)} />
              <div
                role="menu"
                className="glass animate-pop-in absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-panel p-1.5"
              >
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={filter === opt.key}
                    onClick={() => {
                      setFilter(opt.key);
                      setFilterMenuOpen(false);
                    }}
                    className={
                      'press flex w-full items-center justify-between rounded-ctl px-3 py-2.5 text-left text-[12px] font-bold ' +
                      'transition-colors duration-[160ms] ' +
                      (filter === opt.key
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-muted hover:bg-[var(--surface-sunken)]')
                    }
                  >
                    {opt.label}
                    {filter === opt.key && <Check size={15} strokeWidth={2.4} />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Incident cards */}
      {filteredIncidents.length === 0 ? (
        <EmptyState
          icon={<History size={24} strokeWidth={1.7} />}
          title="No alerts here"
          description="Alerts you raise with SOS will be listed here with their status."
        />
      ) : (
        <ul className="space-y-2.5">
          {filteredIncidents.map((incident, i) => (
            <li key={incident.id} style={{ ['--i' as string]: i } as React.CSSProperties}>
              <GlassCard interactive>
                <button
                  type="button"
                  onClick={() => setSelectedIncident(incident)}
                  className="press w-full text-left"
                  aria-label={`Open alert ${incident.incidentCode}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] font-extrabold text-ink">
                        {incident.incidentCode}
                      </span>
                      <Badge tone={statusTone(incident.status)}>{incident.status}</Badge>
                    </div>
                    <ChevronRight size={18} strokeWidth={1.9} className="mt-0.5 shrink-0 text-muted" />
                  </div>

                  <p className="mt-2.5 flex items-start gap-1.5">
                    <MapPin size={15} strokeWidth={1.9} className="mt-0.5 shrink-0 text-muted" />
                    <span className="t-body min-w-0 text-muted">
                      {incident.location.address ||
                        `${incident.location.barangay}, ${incident.location.city}`}
                    </span>
                  </p>

                  <p className="t-caption mt-3 flex items-center gap-1.5 border-t border-[rgba(15,31,58,.06)] pt-3 text-muted dark:border-white/[.08]">
                    <Clock size={13} strokeWidth={1.9} />
                    {incident.date} · {incident.timeActivated}
                  </p>
                </button>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}

      <IncidentDetailsModal
        incident={selectedIncident}
        isOpen={Boolean(selectedIncident)}
        onClose={() => setSelectedIncident(null)}
        onOpenAudioEvidence={onOpenAudioEvidence}
      />
    </div>
  );
};
