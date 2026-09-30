import React, { useState } from 'react';
import { FileText, Clock, MapPin, ChevronRight, ChevronDown, Check, AlertCircle, CheckCircle2, Shield, Filter } from 'lucide-react';
import { Incident } from '../../types';
import { IncidentDetailsModal } from './IncidentDetailsModal';

interface UserIncidentsScreenProps {
  incidents: Incident[];
  onOpenAudioEvidence?: (incident: Incident) => void;
}

export const UserIncidentsScreen: React.FC<UserIncidentsScreenProps> = ({
  incidents,
  onOpenAudioEvidence,
}) => {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ALL');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const filterOptions = [
    { key: 'ALL', label: 'All Incidents' },
    { key: 'ACTIVE', label: 'Active' },
    { key: 'RESOLVED', label: 'Resolved' },
  ] as const;

  const filteredIncidents = incidents.filter((inc) => {
    if (filter === 'ALL') return true;
    if (filter === 'ACTIVE') return inc.status === 'ACTIVE' || inc.status === 'RESPONDING' || inc.status === 'RESPONDER EN ROUTE';
    if (filter === 'RESOLVED') return inc.status === 'RESOLVED' || inc.status === 'CANCELLED';
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'RESPONDING':
      case 'RESPONDER EN ROUTE':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'RESOLVED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'CANCELLED':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  return (
    <div id="user-incidents-screen" className="min-h-[70vh] pb-8">
      {/* Fixed panel — talagang hindi gumagalaw; cards lang ang nagso-scroll sa loob */}
      <div className="fixed top-[100px] left-4 right-4 sm:left-6 sm:right-6 z-20 flex flex-col overflow-y-auto max-h-[calc(100vh-170px)] pb-4" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}>
        {/* Header — katulad ng Live Maps: transparent dati, nagiging blur overlay pag nag-scroll */}
        <div className={`sticky top-0 z-10 flex items-center justify-between transition-all duration-300 ${scrolled ? 'bg-white/20  0 backdrop-blur-xl rounded-2xl border-b border-slate-200/60 pb-1.5' : 'bg-transparent'}`}>
          <div>
          <h2 className="text-lg font-black relative left-5 text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-7 h-7 text-blue-600" />
            <span>INCIDENTS</span>
          </h2>
        </div>

        {/* Filter Menu */}
        <div className="relative right-3">
          <button
            onClick={() => setFilterMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-slate-700 hover:bg-white/50 transition-all active:scale-95"
          >
            <Filter className="w-3.5 h-3.5 text-blue-600" />
            <span>
              {filterOptions.find((o) => o.key === filter)?.label ?? 'All Incidents'}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${filterMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {filterMenuOpen && (
            <>
              {/* Click-away backdrop */}
              <div className="fixed inset-0 z-20" onClick={() => setFilterMenuOpen(false)} />
              <div className="absolute right-0 mt-1.5 z-30 w-44 rounded-2xl bg-white border border-slate-200 shadow-lg p-1 text-[11px] font-bold overflow-hidden">
                {filterOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setFilter(opt.key);
                      setFilterMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition-all ${
                      filter === opt.key ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                    {filter === opt.key && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Incidents Card List */}
      <div className="relative top-5 pt-1 space-y-2.5">
        {filteredIncidents.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 text-xs text-slate-400">
            No incidents found in this category.
          </div>
        ) : (
          filteredIncidents.map((incident) => (
            <div
              key={incident.id}
              onClick={() => setSelectedIncident(incident)}
              className="bg-white rounded-3xl p-4 border border-slate-200/80 hover:border-blue-300 transition-all shadow-xs cursor-pointer group active:scale-[0.99] space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                    {incident.incidentCode}
                  </span>
                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${getStatusBadge(incident.status)}`}>
                    {incident.status}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
              </div>

              <div className="text-xs text-slate-600 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{incident.location.address}, {incident.location.barangay}</span>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{incident.date} • {incident.timeActivated}</span>
                </span>
                <span className="font-semibold text-blue-600 group-hover:underline">
                  View Timeline →
                </span>
              </div>
            </div>
          ))
        )}
      </div>
      </div>

      {/* Details Modal */}
      <IncidentDetailsModal
        incident={selectedIncident}
        isOpen={Boolean(selectedIncident)}
        onClose={() => setSelectedIncident(null)}
        onOpenAudioEvidence={onOpenAudioEvidence}
      />
    </div>
  );
};