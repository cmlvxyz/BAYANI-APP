import React from 'react';
import { X, Bell, CheckCheck, Radio, MapPin, Mic, Users, ShieldAlert, Clock } from 'lucide-react';
import { AppNotification } from '../../types';

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
  if (!isOpen) return null;

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'sos':
        return <ShieldAlert className="w-4 h-4 text-red-600" />;
      case 'location':
        return <MapPin className="w-4 h-4 text-blue-600" />;
      case 'audio':
        return <Mic className="w-4 h-4 text-purple-600" />;
      case 'contact':
        return <Users className="w-4 h-4 text-emerald-600" />;
      case 'responder':
        return <Radio className="w-4 h-4 text-blue-600" />;
      default:
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div 
        id="user-notifications-modal"
        className="bg-white rounded-3xl max-w-sm w-full max-h-[85vh] overflow-y-auto border border-slate-200 shadow-2xl p-5 space-y-3"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-600" />
            <h3 className="font-extrabold text-slate-900 text-sm">
              Notifications Center
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-[11px] text-slate-400 font-medium">
            {notifications.length} recent alerts
          </span>
          <button
            onClick={onMarkAllRead}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark all read</span>
          </button>
        </div>

        {/* List of notifications */}
        <div className="space-y-2 pt-1">
          {notifications.length === 0 ? (
            <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-400">
              No alerts yet — emergency notifications will appear here.
            </div>
          ) : notifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-3 rounded-2xl border transition-all text-xs flex items-start gap-2.5 ${
                notif.isEmergency
                  ? 'bg-red-50/70 border-red-200/80'
                  : notif.isRead
                  ? 'bg-slate-50 border-slate-100 opacity-80'
                  : 'bg-white border-blue-100 shadow-2xs'
              }`}
            >
              <div className="w-7 h-7 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                {getIcon(notif.type)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 truncate">
                    {notif.title}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-1">
                    {notif.timestamp}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  {notif.message}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};