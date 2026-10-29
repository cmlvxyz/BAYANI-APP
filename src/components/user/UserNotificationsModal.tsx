import React from 'react';
import { CheckCheck, Radio, MapPin, Mic, Users, ShieldAlert, Bell } from 'lucide-react';
import { AppNotification } from '../../types';
import { Button, Sheet, EmptyState } from '../ui';

interface UserNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAllRead: () => void;
}

export const UserNotificationsModal: React.FC<UserNotificationsModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
}) => {
  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'sos':
        return <ShieldAlert size={16} strokeWidth={1.9} className="text-danger" />;
      case 'location':
        return <MapPin size={16} strokeWidth={1.9} className="text-brand-600" />;
      case 'audio':
        return <Mic size={16} strokeWidth={1.9} className="text-brand-600" />;
      case 'contact':
        return <Users size={16} strokeWidth={1.9} className="text-success" />;
      case 'responder':
        return <Radio size={16} strokeWidth={1.9} className="text-brand-600" />;
      default:
        return <Bell size={16} strokeWidth={1.9} className="text-muted" />;
    }
  };

  return (
    <Sheet
      id="user-notifications-modal"
      isOpen={isOpen}
      onClose={onClose}
      title="Notifications"
      subtitle={`${notifications.length} recent ${notifications.length === 1 ? 'alert' : 'alerts'}`}
      headerAction={
        notifications.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMarkAllRead}
            icon={<CheckCheck size={15} strokeWidth={1.9} />}
          >
            Mark all read
          </Button>
        ) : null
      }
    >
      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell size={24} strokeWidth={1.7} />}
          title="Nothing yet"
          description="Emergency notifications will appear here the moment something happens."
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((notif) => (
            <li
              key={notif.id}
              className={
                'flex items-start gap-2.5 rounded-card border px-3.5 py-3 ' +
                (notif.isEmergency
                  ? 'border-danger/25 bg-danger-soft'
                  : notif.isRead
                    ? 'border-[rgba(11,27,51,.05)] bg-[var(--surface-sunken)] opacity-75'
                    : 'border-brand-200 bg-brand-50')
              }
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-ctl bg-[var(--surface)]">
                {getIcon(notif.type)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-[13px] font-extrabold text-ink">
                    {notif.title}
                  </p>
                  <span className="shrink-0 font-mono text-[10px] text-muted">
                    {notif.timestamp}
                  </span>
                </div>
                <p className="t-body text-muted">{notif.message}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
};
