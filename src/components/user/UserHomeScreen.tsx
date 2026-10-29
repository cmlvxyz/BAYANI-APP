import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  MapPin,
  Users,
  Wifi,
  Radio,
  Mic,
  PhoneCall,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Navigation,
  EyeOff,
  History,
  Phone,
  MapPinned,
  Siren,
  Loader2,
  Link2,
  Link2Off,
} from 'lucide-react';
import { EmergencyContactItem, Incident, UserNavTab } from '../../types';
import { WearableDeviceTelemetry, hardwareService, BALANGA_LOCATION } from '../../services/hardwareService';
import { LiveGoogleMap } from '../LiveGoogleMap';
import { Badge, Button, GlassCard, GlassCardButton, Sheet, LinkButton, Timeline } from '../ui';
import type { UseLiveLocationResult } from '../../hooks/useLiveLocation';

interface UserHomeScreenProps {
  telemetry: WearableDeviceTelemetry;
  activeIncident: Incident | null;
  onSimulateHardwareSOS: () => void;
  onConfirmHelped: () => void;
  onNavigateTab: (tab: UserNavTab) => void;
  onOpenIncident?: (incident: Incident) => void;
  stealthMode: boolean;
  /** True while the app is requesting the exact GPS fix before raising the SOS. */
  locating: boolean;
  /** User-facing GPS error message (alert is NOT sent) — null when idle. */
  locationError: string | null;
  /**
   * Shared device GPS watcher owned by the app shell. The citizen never has to
   * set anything — the manual override below is optional and testing-only.
   */
  liveLocation: UseLiveLocationResult;
  /** Live link between this app and the Response Center backend. */
  bridgeOnline: boolean;
  /** Emergency contacts stored for this account (count shown on the dashboard). */
  contacts: EmergencyContactItem[];
  /** Alert history, newest first, as loaded from the backend. */
  incidents: Incident[];
}

export const UserHomeScreen: React.FC<UserHomeScreenProps> = ({
  telemetry,
  activeIncident,
  onSimulateHardwareSOS,
  onConfirmHelped,
  onNavigateTab,
  onOpenIncident,
  stealthMode,
  locating,
  locationError,
  liveLocation,
  bridgeOnline,
  contacts,
  incidents,
}) => {
  const [switchOn, setSwitchOn] = useState(false);
  const [responderSheetOpen, setResponderSheetOpen] = useState(false);
  const { fix: autoFix, place: autoPlace, phase: livePhase } = liveLocation;
  const isEmergency =
    telemetry.event === 'SOS' ||
    (activeIncident && activeIncident.status !== 'RESOLVED' && activeIncident.status !== 'CANCELLED');

  // Slide the SOS control back to OFF once the emergency is resolved/cancelled
  useEffect(() => {
    if (!isEmergency) setSwitchOn(false);
  }, [isEmergency]);

  // If the GPS fix failed, the alarm was NOT sent — revert the control.
  useEffect(() => {
    if (locationError) setSwitchOn(false);
  }, [locationError]);

  // Animate the control to ON first, then fire the SOS (unchanged trigger).
  const handlePressSOS = () => {
    if (switchOn || locating) return;
    setSwitchOn(true);
    setTimeout(() => onSimulateHardwareSOS(), 200);
  };

  // Honest transmission label driven by the real state machine (sosQueue).
  const sending = activeIncident?.sending;
  const transmission = (() => {
    switch (sending?.state) {
      case 'CREATED':
      case 'LOCATION_SNAPSHOT_TAKEN':
        return { label: 'Preparing alert…', tone: 'warn' as const };
      case 'SAVED_OFFLINE':
        return { label: 'Saved offline — auto-retry on next connection', tone: 'warn' as const };
      case 'SENDING':
        return { label: 'Sending to Response Center…', tone: 'warn' as const };
      case 'SERVER_RECEIVED':
        return { label: 'Received by the Response Center', tone: 'success' as const };
      case 'FAILED':
        return { label: `Could not send — ${sending.error || 'no connection'}`, tone: 'danger' as const };
      default:
        return null;
    }
  })();

  const TONE_CLS = {
    warn: 'bg-warn-soft text-warn',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger',
  } as const;

  // Emergency map anchors on the real incident position, then the live device
  // fix, then the wearable's last known point. Never a hardcoded city.
  const incidentHasCoords = Boolean(
    activeIncident && (activeIncident.location.lat !== 0 || activeIncident.location.lng !== 0),
  );
  const mapLat = incidentHasCoords ? activeIncident!.location.lat : (autoFix?.lat ?? telemetry.latitude);
  const mapLng = incidentHasCoords ? activeIncident!.location.lng : (autoFix?.lng ?? telemetry.longitude);
  const mapHasCoords = mapLat !== 0 || mapLng !== 0;

  const activeContacts = contacts.filter((c) => c.isActive !== false).length;
  const recentIncidents = incidents.slice(0, 3);

  return (
    <div id="user-home-screen" className="space-y-4 pb-6">
      {/* ============ 1. SAFE STATE ============ */}
      {!isEmergency && (
        <>
          {/* ---- Branding / greeting ---- */}
          <header className="animate-rise-in">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-ctl bg-brand-600 text-white">
                <ShieldCheck size={15} strokeWidth={2.2} />
              </span>
              <p className="t-caption text-muted">
                {new Date().getHours() < 12
                  ? 'Good morning'
                  : new Date().getHours() < 18
                    ? 'Good afternoon'
                    : 'Good evening'}
              </p>
            </div>
          </header>

          <GlassCard
            id="card-wearable-trigger"
            flush
            className="animate-stagger relative overflow-hidden p-0"
            style={{ ['--i' as string]: 1 } as React.CSSProperties}
          >
            <div className="p-4">
              <div className="flex justify-center py-2">
                <button
                  id="btn-simulate-hardware-sos"
                  type="button"
                  onClick={handlePressSOS}
                  aria-pressed={switchOn}
                  aria-label="Send an emergency SOS to the Response Center"
                  disabled={locating || switchOn}
                  className={
                    'press relative grid h-28 w-28 place-items-center overflow-hidden rounded-full text-white ' +
                    'transition-[background-color,box-shadow,transform] duration-[160ms] ' +
                    'disabled:cursor-wait disabled:opacity-70 ' +
                    (switchOn
                      ? 'bg-success'
                      : 'bg-emergency shadow-emergency hover:bg-emergency-deep')
                  }
                >
                  {!switchOn && !locating && (
                    <span
                      aria-hidden="true"
                      className="sos-halo pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/60"
                    />
                  )}

                  <span className="relative flex flex-col items-center gap-1">
                    {locating && <Loader2 size={24} strokeWidth={2.4} className="animate-spin" />}
                    {switchOn && <CheckCircle2 size={24} strokeWidth={2.4} />}
                    {!locating && !switchOn && <Siren size={24} strokeWidth={2.3} />}
                    <span className="t-display leading-none">
                      {switchOn ? 'Sent' : locating ? 'Locating…' : 'SOS'}
                    </span>
                  </span>
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <ReadinessTile
                  icon={<Radio size={15} strokeWidth={1.9} />}
                  label="Device"
                  value={telemetry.bleConnected ? 'Connected' : 'Offline'}
                  tone={telemetry.bleConnected ? 'success' : 'danger'}
                />
                <ReadinessTile
                  icon={<MapPin size={15} strokeWidth={1.9} />}
                  label="GPS"
                  value={telemetry.gpsFix}
                  tone={telemetry.gpsFix === 'Locked' ? 'success' : 'warn'}
                />
                <ReadinessTile
                  icon={<Wifi size={15} strokeWidth={1.9} />}
                  label="Comms"
                  value={telemetry.gsmSignal}
                  tone={telemetry.gsmSignal === 'Strong' ? 'success' : 'warn'}
                />
                <ReadinessTile
                  icon={<Mic size={15} strokeWidth={1.9} />}
                  label="Audio"
                  value={telemetry.audioStatus}
                  tone="brand"
                />
              </div>
            </div>
          </GlassCard>

          {/* GPS error (alert was NOT sent) */}
          {locationError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-card border border-danger/25 bg-danger-soft px-4 py-3.5"
            >
              <AlertCircle size={18} strokeWidth={1.9} className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0">
                <p className="text-[13px] font-extrabold text-danger">Emergency alert not sent</p>
                <p className="t-body text-danger/85">{locationError}</p>
                <p className="mt-1 text-[11px] font-semibold text-danger/70">
                  Please try again once your device has a GPS fix.
                </p>
              </div>
            </div>
          )}

          {/* ---- Recent alerts (real, from the backend) ---- */}
          {recentIncidents.length > 0 && (
            <GlassCard flush className="overflow-hidden p-0">
              <div className="flex items-center justify-between gap-3 border-b border-[rgba(11,27,51,.06)] px-4 py-3 dark:border-white/[.08]">
                <p className="t-caption text-muted">Recent alerts</p>
                <p className="t-caption text-muted">
                  {recentIncidents.length} of {incidents.length}
                </p>
              </div>
              <ul>
                {recentIncidents.map((inc, i) => (
                  <li key={inc.id} style={{ ['--i' as string]: i } as React.CSSProperties}>
                    <button
                      type="button"
                      onClick={() => onOpenIncident?.(inc)}
                      className={
                        'press flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[160ms] hover:bg-[var(--surface-sunken)] ' +
                        (i === 0 ? '' : 'border-t border-[rgba(11,27,51,.05)] dark:border-white/[.06]')
                      }
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ctl bg-brand-50 text-brand-600">
                        <History size={16} strokeWidth={1.9} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[13px] font-extrabold text-ink">
                          {inc.incidentCode}
                        </p>
                        <p className="t-body truncate text-muted">
                          {inc.date} · {inc.timeActivated}
                        </p>
                      </div>
                      <Badge tone={statusTone(inc.status)}>{inc.status}</Badge>
                      <ChevronRight size={16} strokeWidth={1.9} className="shrink-0 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}

          {/* Automatic location — no setup required; the override below is optional */}
          <GlassCard>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Navigation size={16} strokeWidth={1.9} className="text-brand-600" />
                <p className="t-heading text-ink">Your location</p>
              </div>
              {hardwareService.getLocationOverride() ? (
                <Badge tone="brand">Fixed</Badge>
              ) : autoFix ? (
                <Badge tone="success" icon={<span className="h-1.5 w-1.5 rounded-full bg-success" />}>
                  GPS — live
                </Badge>
              ) : livePhase === 'locating' ? (
                <Badge tone="neutral">Locating…</Badge>
              ) : livePhase === 'denied' ? (
                <Badge tone="warning">Permission needed</Badge>
              ) : (
                <Badge tone="warning">Unavailable</Badge>
              )}
            </div>

            <div className="mt-3 rounded-ctl bg-[var(--surface-sunken)] px-3.5 py-3">
              {!autoFix && !hardwareService.getLocationOverride() && livePhase !== 'locating' ? (
                <p className="t-body text-muted">Allow location access so alerts carry your position</p>
              ) : (
                <>
                  <p className="text-[13px] font-extrabold text-ink">
                    {hardwareService.getLocationOverride()
                      ? (hardwareService.getLocationOverride()?.address ??
                        hardwareService.getLocationOverride()?.label)
                      : autoPlace?.address ||
                        autoPlace?.city ||
                        telemetry.locationName ||
                        (autoFix ? 'Current position' : 'Finding where you are…')}
                  </p>
                  <p className="t-caption mt-1 text-muted">
                    {hardwareService.getLocationOverride()
                      ? 'Manually fixed — clear it on the Map tab to go back to automatic'
                      : autoFix
                        ? `${autoFix.lat.toFixed(4)}° N, ${autoFix.lng.toFixed(4)}° E · ±${Math.round(autoFix.accuracy)} m · detected automatically`
                        : 'Allow location access so alerts carry your position'}
                  </p>
                </>
              )}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                id="btn-home-set-balanga"
                variant="secondary"
                size="sm"
                icon={<MapPin size={15} strokeWidth={1.9} />}
                onClick={() => hardwareService.setLocationOverride(BALANGA_LOCATION)}
              >
                Override: Balanga City
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<MapPinned size={15} strokeWidth={1.9} />}
                onClick={() => onNavigateTab('map')}
              >
                View on live map
              </Button>
            </div>
          </GlassCard>

          {stealthMode && (
            <GlassCard>
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ctl bg-warn-soft text-warn">
                  <EyeOff size={16} strokeWidth={1.9} />
                </span>
                <p className="t-body text-muted">
                  <span className="font-extrabold text-ink">Stealth mode is on.</span> Emergency
                  functions stay discreet until you need them.
                </p>
              </div>
            </GlassCard>
          )}
        </>
      )}

      {/* ============ 2. ALERT ACTIVE ============ */}
      {isEmergency && activeIncident && (
        <div id="emergency-screen" className="animate-screen-in space-y-4">
          {/* Title + active badge + code */}
          <header>
            <div className="flex items-center gap-2.5">
              <h2 className="t-display text-ink">Alert sent</h2>
              <Badge tone="danger" icon={<span className="h-1.5 w-1.5 rounded-full bg-danger" />}>
                Active
              </Badge>
            </div>
            <p className="t-body mt-1.5 font-mono font-semibold text-muted">
              {activeIncident.incidentCode}
              <span className="mx-2 text-brand-200">·</span>
              {activeIncident.date} {activeIncident.timeActivated}
            </p>
          </header>

          {/* Real transmission state — never a fake "delivered" */}
          {transmission && (
            <div
              role="status"
              className={'relative overflow-hidden rounded-card px-4 py-3 ' + TONE_CLS[transmission.tone]}
            >
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
                <span className="text-[13px] font-bold">{transmission.label}</span>
              </div>
              {sending?.state === 'SENDING' && (
                <span
                  aria-hidden="true"
                  className="animate-transmit-bar absolute inset-x-0 bottom-0 h-[3px] bg-current opacity-60"
                />
              )}
            </div>
          )}

          {/* Map card */}
          <GlassCard flush className="overflow-hidden p-0">
            <div className="relative h-[190px] w-full">
              {mapHasCoords ? (
                <LiveGoogleMap lat={mapLat} lng={mapLng} zoom={16} className="absolute inset-0" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
                  <p className="text-[13px] font-bold text-ink">Waiting for your position</p>
                  <p className="t-caption text-muted">
                    The map will appear once your device reports a GPS fix.
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-ctl bg-success-soft text-success">
                <MapPin size={18} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="t-heading text-ink">Live location sharing</p>
                <p className="t-body truncate text-muted">
                  {activeIncident.location.address ||
                    `${activeIncident.location.barangay}, ${activeIncident.location.city}`}
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Status timeline — real backend steps only */}
          <GlassCard>
            <Timeline steps={activeIncident.timeline} label="Status" />
          </GlassCard>

          {/* Assigned responder */}
          {activeIncident.assignedResponder && (
            <GlassCard>
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-brand-600 text-white">
                  <Navigation size={19} strokeWidth={1.9} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="t-heading truncate text-ink">{activeIncident.assignedResponder.name}</p>
                  <p className="t-body truncate text-muted">{activeIncident.assignedResponder.unit}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="t-caption text-muted">ETA</p>
                  <p className="text-[13px] font-extrabold text-brand-600">
                    {activeIncident.assignedResponder.eta}
                  </p>
                </div>
              </div>
            </GlassCard>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2.5">
            <LinkButton
              id="btn-emergency-call-911"
              href="tel:911"
              variant="secondary"
              icon={<PhoneCall size={17} strokeWidth={1.9} />}
            >
              Call 911
            </LinkButton>

            {/* Existing gate preserved: confirm-helped only once the responder is on the way. */}
            {activeIncident.status === 'ON THE WAY' ? (
              <Button
                id="btn-emergency-confirm-helped"
                variant="primary"
                icon={<CheckCircle2 size={17} strokeWidth={1.9} />}
                onClick={onConfirmHelped}
              >
                I&rsquo;m safe now
              </Button>
            ) : (
              <Button
                id="btn-emergency-contact-responder"
                variant="primary"
                icon={<PhoneCall size={17} strokeWidth={1.9} />}
                onClick={() => setResponderSheetOpen(true)}
              >
                Contact
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Responder contact — replaces the old window.alert() */}
      {activeIncident && (
        <Sheet
          id="responder-contact-sheet"
          isOpen={responderSheetOpen}
          onClose={() => setResponderSheetOpen(false)}
          title="Contact responder"
          subtitle="Calling your assigned response unit"
          size="sm"
          footer={
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setResponderSheetOpen(false)}
            >
              Close
            </Button>
          }
        >
          <div className="space-y-2.5">
            <DetailRow label="Responder" value={activeIncident.assignedResponder?.name || 'Response Center'} />
            <DetailRow label="Unit" value={activeIncident.assignedResponder?.unit || 'Municipal Response Center'} />
            <DetailRow label="Phone" value={activeIncident.assignedResponder?.phone || '911'} mono />
            <DetailRow label="Estimated arrival" value={activeIncident.assignedResponder?.eta || 'Dispatching'} />
          </div>

          {activeIncident.assignedResponder?.phone && (
            <LinkButton
              href={`tel:${activeIncident.assignedResponder.phone}`}
              variant="danger"
              fullWidth
              className="mt-4"
              icon={<Phone size={17} strokeWidth={1.9} />}
            >
              Call {activeIncident.assignedResponder.name}
            </LinkButton>
          )}
        </Sheet>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const statusTone = (status: string) => {
  switch (status) {
    case 'ACTIVE':
    case 'PENDING':
      return 'danger' as const;
    case 'RESPONDING':
    case 'RESPONDER EN ROUTE':
    case 'ON SCENE':
    case 'WAIT FOR ME':
    case 'ON THE WAY':
      return 'warning' as const;
    case 'RESOLVED':
      return 'success' as const;
    case 'CANCELLED':
      return 'neutral' as const;
    default:
      return 'brand' as const;
  }
};

function ReadinessTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'success' | 'brand' | 'warn' | 'danger';
}) {
  const TILE = {
    success: 'bg-success-soft text-success',
    brand: 'bg-brand-50 text-brand-600',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
  } as const;

  return (
    <div className="flex items-center gap-2 rounded-ctl bg-[var(--surface-sunken)] px-2.5 py-2">
      <span
        className={'grid h-7 w-7 shrink-0 place-items-center rounded-ctl ' + TILE[tone]}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="t-caption truncate text-muted">{label}</p>
        <p className={'truncate text-[12px] font-extrabold capitalize ' + TILE[tone].split(' ')[1]}>
          {value}
        </p>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-ctl bg-[var(--surface-sunken)] px-3.5 py-3">
      <span className="t-caption shrink-0 text-muted">{label}</span>
      <span
        className={
          'min-w-0 truncate text-right text-[13px] font-extrabold text-ink ' +
          (mono ? 'font-mono' : '')
        }
      >
        {value}
      </span>
    </div>
  );
}
