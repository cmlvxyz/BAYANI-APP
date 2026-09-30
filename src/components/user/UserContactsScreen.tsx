import React, { useState } from 'react';
import { 
  Users, 
  Phone, 
  MessageSquare, 
  Plus, 
  Edit2, 
  Trash2, 
  CheckCircle2, 
  Shield, 
  Heart,
  X,
  UserPlus
} from 'lucide-react';
import { EmergencyContactItem } from '../../types';

/** PH mobile accepted forms: 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX, 9XXXXXXXXX. */
const PH_MOBILE_REGEX = /^(?:\+?63|0)?9\d{9}$/;
const stripPhone = (raw: string) => String(raw).replace(/[\s()\-.]/g, '');
const isValidPhMobile = (raw: string) => PH_MOBILE_REGEX.test(stripPhone(raw));
const formatPhMobile = (raw: string) => {
  const digits = String(raw).replace(/\D/g, '');
  const local = digits.startsWith('63') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits;
  if (!/^9\d{9}$/.test(local)) return raw.trim();
  return `+63 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
};

interface UserContactsScreenProps {
  contacts: EmergencyContactItem[];
  onAddContact: (contact: Omit<EmergencyContactItem, 'id'>) => void;
  onUpdateContact: (contact: EmergencyContactItem) => void;
  onDeleteContact: (id: string) => void;
}

export const UserContactsScreen: React.FC<UserContactsScreenProps> = ({
  contacts,
  onAddContact,
  onUpdateContact,
  onDeleteContact,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'TRUSTED' | 'AUTHORITY'>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContactItem | null>(null);
  const [phoneError, setPhoneError] = useState('');

  // Form states for add/edit
  const [formData, setFormData] = useState({
    name: '',
    role: 'Family' as EmergencyContactItem['role'],
    phone: '',
    relationship: '',
    category: 'trusted' as 'trusted' | 'authority',
    isActive: true,
  });

  const filteredContacts = contacts.filter((c) => {
    if (filter === 'ALL') return true;
    if (filter === 'TRUSTED') return c.category === 'trusted';
    if (filter === 'AUTHORITY') return c.category === 'authority';
    return true;
  });

  const handleOpenAdd = () => {
    setFormData({
      name: '',
      role: 'Family',
      phone: '',
      relationship: '',
      category: 'trusted',
      isActive: true,
    });
    setPhoneError('');
    setEditingContact(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (contact: EmergencyContactItem) => {
    setFormData({
      name: contact.name,
      role: contact.role,
      phone: contact.phone,
      relationship: contact.relationship || '',
      category: contact.category,
      isActive: contact.isActive !== false,
    });
    setPhoneError('');
    setEditingContact(contact);
    setIsAddModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) return;

    if (!isValidPhMobile(formData.phone)) {
      setPhoneError('Enter a valid PH mobile number (e.g. 0917 123 4567 or +63 917 123 4567).');
      return;
    }

    const phone = formatPhMobile(formData.phone);
    setPhoneError('');

    if (editingContact) {
      onUpdateContact({
        ...editingContact,
        ...formData,
        phone,
      });
    } else {
      onAddContact({
        ...formData,
        phone,
        notificationStatus: 'STANDBY',
      });
    }
    setIsAddModalOpen(false);
  };

  const getStatusPill = (status: EmergencyContactItem['notificationStatus']) => {
    switch (status) {
      case 'NOTIFIED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'CONTACTED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'EN ROUTE':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div id="user-contacts-screen" className="space-y-4 pb-8">
      {/* Header — walang background; nag-o-overlay ang global header sa itaas kapag nag-scroll (tulad ng Incidents/Live) */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>EMERGENCY CONTACTS</span>
          </h2>
        </div>

        <button
          onClick={handleOpenAdd}
          className="py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xs transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>ADD</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="mx-auto flex w-60 bg-slate-100 p-1 rounded-2xl text-[11px] font-bold">
        <button
          onClick={() => setFilter('ALL')}
          className={`flex-1 py-1.5 rounded-xl transition-all ${
            filter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          All ({contacts.length})
        </button>
        <button
          onClick={() => setFilter('TRUSTED')}
          className={`flex-1 py-1.5 rounded-xl transition-all ${
            filter === 'TRUSTED' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Trusted Circle
        </button>
        <button
          onClick={() => setFilter('AUTHORITY')}
          className={`flex-1 py-1.5 rounded-xl transition-all ${
            filter === 'AUTHORITY' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Authorities
        </button>
      </div>

      {/* Contacts Cards */}
      <div className="pt-1 space-y-3">
        {filteredContacts.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 text-xs text-slate-400 shadow-xs">
            No contacts yet
          </div>
        ) : filteredContacts.map((contact) => (
          <div
            key={contact.id}
            className={`bg-white rounded-3xl p-4 border shadow-xs space-y-3 ${
              contact.isActive === false ? 'border-slate-200/60 opacity-60' : 'border-slate-200/80'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-white ${
                  contact.category === 'authority' ? 'bg-slate-800' : 'bg-purple-600'
                }`}>
                  {contact.category === 'authority' ? (
                    <Shield className="w-4 h-4" />
                  ) : (
                    <Heart className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm leading-tight">
                    {contact.name}
                  </h3>
                  <span className="text-[11px] text-slate-500 block">
                    {contact.relationship || contact.role}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                {contact.isActive === false && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">
                    Paused
                  </span>
                )}
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${getStatusPill(contact.notificationStatus)}`}>
                  {contact.notificationStatus}
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-600 font-mono bg-slate-50 p-2 rounded-xl border border-slate-100 flex items-center justify-between">
              <span className="font-bold text-slate-800">{contact.phone}</span>
              <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase">{contact.role}</span>
            </div>

            {/* Action Buttons: CALL, MESSAGE, EDIT */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs font-bold">
              <a
                href={`tel:${contact.phone}`}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/60 flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>CALL</span>
              </a>

              <a
                href={`sms:${contact.phone}`}
                className="flex-1 py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200/60 flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                <span>MESSAGE</span>
              </a>

              <button
                onClick={() => handleOpenEdit(contact)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Edit Contact"
              >
                <Edit2 className="w-4 h-4" />
              </button>

              {contact.category === 'trusted' && (
                <button
                  onClick={() => onDeleteContact(contact.id)}
                  className="p-2 rounded-xl text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Delete Contact"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Contact Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-600" />
                <span>{editingContact ? 'Edit Emergency Contact' : 'Add Emergency Contact'}</span>
              </h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-600 font-bold block mb-1">Contact Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Full Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-600 font-bold block mb-1">Phone Number</label>
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  placeholder="0917 123 4567 or +63 917 123 4567"
                  value={formData.phone}
                  onChange={(e) => {
                    setPhoneError('');
                    setFormData({ ...formData, phone: e.target.value });
                  }}
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none font-mono ${
                    phoneError ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-blue-500'
                  }`}
                />
                {phoneError ? (
                  <span className="text-[10px] text-red-600 font-semibold block mt-1">{phoneError}</span>
                ) : (
                  <span className="text-[10px] text-slate-400 block mt-1">
                    PH mobile only — used for SOS text alerts.
                  </span>
                )}
              </div>

              <div>
                <label className="text-slate-600 font-bold block mb-1">Role / Relationship</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
                >
                  <option value="Family">Family Member</option>
                  <option value="Friend">Trusted Friend</option>
                  <option value="Guardian">Designated Guardian</option>
                  <option value="Barangay Response Team">Barangay Response Team</option>
                  <option value="VAWC Desk">VAWC Desk</option>
                  <option value="Police / Emergency Response">Police / Emergency Response</option>
                  <option value="Medical Response">Medical Response</option>
                </select>
              </div>

              <div>
                <label className="text-slate-600 font-bold block mb-1">Personal Note / Detail</label>
                <input
                  type="text"
                  placeholder="e.g. Relationship or note"
                  value={formData.relationship}
                  onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-colors ${
                  formData.isActive
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <span>
                  <span className="font-bold text-slate-700 block">Receive SOS text alerts</span>
                  <span className="text-[10px] text-slate-500 block">
                    {formData.isActive ? 'Active — included in emergency SMS' : 'Paused — no SMS will be sent'}
                  </span>
                </span>
                <span
                  className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${
                    formData.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                      formData.isActive ? 'left-4' : 'left-0.5'
                    }`}
                  />
                </span>
              </button>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  {editingContact ? 'Save Changes' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};