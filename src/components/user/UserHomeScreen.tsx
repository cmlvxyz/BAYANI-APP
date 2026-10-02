import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  MapPin,
  Users,
  BatteryCharging,
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
} from 'lucide-react';
import { Incident, UserNavTab } from '../../types';
import { WearableDeviceTelemetry, hardwareService, BALANGA_LOCATION } from '../../services/hardwareService';
import { watchGeolocation, ResolvedLocation } from '../../services/geolocationService';
import { LiveGoogleMap, FALLBACK_COORDS } from '../LiveGoogleMap';
import { Badge, Button, GlassCard, GlassCardButton, Sheet, LinkButton } from '../ui';

interface UserHomeScreenProps {
  telemetry: WearableDeviceTelemetry;
  activeIncident: Incident | null;
  onSimulateHardwareSOS: () => void;
  onConfirmHelped: () => void;
  onNavigateTab: (tab: UserNavTab) => void;
  stealthMode: boolean;
  /** True while the app is requesting the exact GPS fix before raising the SOS. */
  locating: boolean;
  /** User-facing GPS error message (alert is NOT sent) — null when idle. */
  locationError: string | null;
}

export const UserHomeScreen: React.FC<UserHomeScreenProps> = ({
  telemetry,
  activeIncident,
  onSimulateHardwareSOS,
  onConfirmHelped,
  onNavigateTab,
  stealthMode,
  locating,
  locationError,
}) => {
  const [showSimNotice, setShowSimNotice] = useState(true);
  const [switchOn, setSwitchOn] = useState(false);
  const [responderSheetOpen, setResponderSheetOpen] = useState(false);
  // Automatic location: device GPS, falling back to IP geolocation. The citizen
  // never has to set anything — the manual override below is optional.
  const [autoLocation, setAutoLocation] = useState<ResolvedLocation | null>(null);
  const [autoLocating, setAutoLocating] = useState(true);
  const isEmergency = telemetry.event === 'SOS' || (activeIncident && activeIncident.status !== 'RESOLVED' && activeIncident.status !== 'CANCELLED');

  useEffect(() => {
    const cleanup = watchGeolocation(
      (loc) => {
        setAutoLocation(loc);
        setAutoLocating(false);
      },
      () => {
        setAutoLocating(false);
      },
    );
    return cleanup;
  }, []);

  // Slide the SOS switch back to OFF once the emergency is resolved/cancelled
  useEffect(() => {
    if (!isEmergency) setSwitchOn(false);
  }, [isEmergency]);

  // If the GPS fix failed, the alarm was NOT sent — revert the switch.
  useEffect(() => {
    if (locationError) setSwitchOn(false);
  }, [locationError]);

  // Animate the switch to ON first, then fire the SOS
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

  const mapLat = activeIncident?.location.lat || FALLBACK_COORDS.lat;
  const mapLng = activeIncident?.location.lng || FALLBACK_COORDS.lng;

  return (
    <div id="user-home-screen" className="space-y-5 pb-6">
      {/* ============ 1. SAFE STATE ============ */}
      {!isEmergency && (
        <>
          {/* Greeting + headline */}
          <header className="animate-rise-in">
            <p className="t-body font-semibold text-muted">
              {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}
            </p>
            <h2 className="t-display mt-1.5 text-ink">
              You&rsquo;re protected. Help is one tap away.
            </h2>
          </header>

          {/* Status chips */}
          <div className="animate-stagger flex flex-wrap gap-2" style={{ ['--i' as string]: 0 }}>
            <Badge tone="success" icon={<MapPin size={12} strokeWidth={2.2} />}>
              Location on
            </Badge>
            <Badge tone="brand" icon={<Users size={12} strokeWidth={2.2} />}>
              Contacts ready
            </Badge>
            <Badge tone="neutral" icon={<BatteryCharging size={12} strokeWidth={2.2} />}>
              Band {telemetry.battery}%
            </Badge>
          </div>

          {/* Device readiness */}
          <GlassCard className="animate-stagger" style={{ ['--i' as string]: 1 } as React.CSSProperties}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
          </GlassCard>

          {/* ===== SOS — the paired wearable itself is the trigger ===== */}
          <GlassCard
            id="card-wearable-trigger"
            className="animate-stagger"
            style={{ ['--i' as string]: 2 } as React.CSSProperties}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="t-caption text-muted">Wearable connected</p>
              <Badge tone="success" icon={<span className="h-1.5 w-1.5 rounded-full bg-success" />}>
                {switchOn ? 'Alert sent' : 'Ready'}
              </Badge>
            </div>

            <button
              id="btn-simulate-hardware-sos"
              type="button"
              onClick={handlePressSOS}
              aria-pressed={switchOn}
              aria-label="Squeeze the Bayani Alert wearable to send an emergency SOS"
              disabled={locating || switchOn}
              className="press mt-3 flex w-full flex-col items-center gap-3 rounded-card border border-[rgba(15,31,58,.06)] bg-[var(--surface-sunken)] px-4 py-5 disabled:cursor-wait disabled:opacity-55 dark:border-white/[.08]"
            >
              <img
                src="/bayani.png"
                alt="Bayani Alert emergency SOS wearable"
                className="max-h-28 w-auto max-w-[15rem] select-none object-contain"
                draggable="false"
              />
              <span className="t-heading text-center text-ink">
                {switchOn
                  ? 'Alert sent'
                  : locating
                    ? 'Getting your location…'
                    : 'Squeeze to send SOS'}
              </span>
              <span className="t-body max-w-[18rem] text-center text-muted">
                {switchOn
                  ? 'Your location, contacts and ambient audio are with the Response Center.'
                  : 'Squeeze your paired thigh band. Your location, contacts and ambient audio go to the Response Center.'}
              </span>
            </button>
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

          {/* Two shortcut cards */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <GlassCardButton
              id="card-home-trusted-circle"
              onClick={() => onNavigateTab('contacts')}
              className="animate-stagger"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-600">
                  <Users size={20} strokeWidth={1.9} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="t-heading truncate text-ink">Trusted circle</p>
                  <p className="t-body truncate text-muted">Who gets alerted with you</p>
                </div>
                <ChevronRight size={18} strokeWidth={1.9} className="shrink-0 text-muted" />
              </div>
            </GlassCardButton>

            <GlassCard
              id="card-home-alert-history"
              className="animate-stagger"
              style={{ ['--i' as string]: 1 } as React.CSSProperties}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-600">
                  <History size={20} strokeWidth={1.9} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="t-heading truncate text-ink">Alert history</p>
                  <p className="t-body truncate text-muted">
                    {activeIncident
                      ? `Active · ${activeIncident.incidentCode}`
                      : 'No alerts raised yet'}
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Automatic location — no setup required; the override below is optional */}
          <GlassCard>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Navigation size={16} strokeWidth={1.9} className="text-brand-600" />
                <p className="t-heading text-ink">Your location</p>
              </div>
              {hardwareService.getLocationOverride() ? (
                <Badge tone="brand">Fixed</Badge>
              ) : autoLocating ? (
                <Badge tone="neutral">Locating…</Badge>
              ) : autoLocation?.source === 'gps' ? (
                <Badge tone="success" icon={<span className="h-1.5 w-1.5 rounded-full bg-success" />}>
                  GPS — live
                </Badge>
              ) : autoLocation ? (
                <Badge tone="warning">Approx — IP</Badge>
              ) : (
                <Badge tone="warning">Unavailable</Badge>
              )}
            </div>

            <div className="mt-3 rounded-ctl bg-[var(--surface-sunken)] px-3.5 py-3">
              {autoLocating && !hardwareService.getLocationOverride() ? (
                <p className="t-body text-muted">Finding where you are…</p>
              ) : (
                <>
                  <p className="text-[13px] font-extrabold text-ink">
                    {hardwareService.getLocationOverride()
                      ? (hardwareService.getLocationOverride()?.address ??
                        hardwareService.getLocationOverride()?.label)
                      : autoLocation?.label || autoLocation?.city || telemetry.locationName || 'Location unavailable'}
                  </p>
                  <p className="t-caption mt-1 text-muted">
                    {hardwareService.getLocationOverride()
                      ? 'Manually fixed — clear it on the Map tab to go back to automatic'
                      : autoLocation
                        ? `${autoLocation.lat.toFixed(4)}° N, ${autoLocation.lng.toFixed(4)}° E · detected automatically`
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
              className={'flex items-center gap-2.5 rounded-card px-4 py-3 ' + TONE_CLS[transmission.tone]}
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
              <span className="text-[13px] font-bold">{transmission.label}</span>
            </div>
          )}

          {/* Map card */}
          <GlassCard flush className="overflow-hidden p-0">
            <div className="relative h-[190px] w-full">
              <LiveGoogleMap lat={mapLat} lng={mapLng} zoom={16} className="absolute inset-0" />
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

          {/* Status timeline */}
          <GlassCard>
            <p className="t-caption text-muted">Status</p>
            <ol className="mt-3 space-y-3.5">
              {activeIncident.timeline.map((step) => {
                const done = step.status === 'completed';
                return (
                  <li key={step.id} className="flex items-start gap-3">
                    <span
                      className={
                        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ' +
                        (done ? 'bg-success text-white' : 'bg-[var(--surface-sunken)] text-muted')
                      }
                    >
                      {done ? (
                        <CheckCircle2 size={12} strokeWidth={3} />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={'text-[13px] font-extrabold ' + (done ? 'text-ink' : 'text-muted')}>
                        {step.title}
                      </p>
                      <p className="t-body text-muted">{step.description}</p>
                    </div>
                    {step.timestamp && (
                      <span className="shrink-0 font-mono text-[10px] text-muted">{step.timestamp}</span>
                    )}
                  </li>
                );
              })}
            </ol>
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
