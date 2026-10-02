import React, { useState } from 'react';
import {
  Phone,
  MessageSquare,
  Plus,
  Edit2,
  Trash2,
  Shield,
  Heart,
  UserRoundPlus,
} from 'lucide-react';
import { EmergencyContactItem } from '../../types';
import {
  Badge,
  Button,
  GlassCard,
  SegmentedControl,
  Sheet,
  TextField,
  SelectField,
  EmptyState,
  LinkButton,
} from '../ui';

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

type Filter = 'ALL' | 'TRUSTED' | 'AUTHORITY';

export const UserContactsScreen: React.FC<UserContactsScreenProps> = ({
  contacts,
  onAddContact,
  onUpdateContact,
  onDeleteContact,
}) => {
  const [filter, setFilter] = useState<Filter>('ALL');
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

  const getStatusTone = (status: EmergencyContactItem['notificationStatus']) => {
    switch (status) {
      case 'NOTIFIED':
        return 'success' as const;
      case 'CONTACTED':
        return 'brand' as const;
      case 'EN ROUTE':
        return 'warning' as const;
      default:
        return 'neutral' as const;
    }
  };

  return (
    <div id="user-contacts-screen" className="space-y-4 pb-6">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <h2 className="t-heading text-ink">Emergency contacts</h2>
        <Button
          size="sm"
          icon={<Plus size={16} strokeWidth={2} />}
          onClick={handleOpenAdd}
          className="shrink-0"
        >
          Add
        </Button>
      </header>

      {/* Glass segmented filter */}
      <SegmentedControl<Filter>
        id="contacts-filter"
        label="Filter contacts"
        value={filter}
        onChange={setFilter}
        options={[
          { key: 'ALL', label: 'All', badge: contacts.length },
          { key: 'TRUSTED', label: 'Trusted' },
          { key: 'AUTHORITY', label: 'Authorities' },
        ]}
      />

      {/* Contact cards */}
      {filteredContacts.length === 0 ? (
        <EmptyState
          icon={<UserRoundPlus size={24} strokeWidth={1.7} />}
          title={filter === 'ALL' ? 'No contacts yet' : 'Nothing here yet'}
          description={
            filter === 'ALL'
              ? 'Add the people and authorities you want alerted when you press SOS.'
              : 'Try another filter, or add a contact to this group.'
          }
          actionLabel="Add contact"
          onAction={handleOpenAdd}
        />
      ) : (
        <ul className="space-y-2.5">
          {filteredContacts.map((contact, i) => (
            <li key={contact.id} style={{ ['--i' as string]: i } as React.CSSProperties}>
              <GlassCard className={contact.isActive === false ? 'opacity-60' : ''}>
                <div className="flex items-start gap-3">
                  {/* 42px icon tile */}
                  <span
                    className={
                      'grid h-[42px] w-[42px] shrink-0 place-items-center rounded-card ' +
                      (contact.category === 'authority'
                        ? 'bg-brand-50 text-brand-600'
                        : 'bg-brand-600 text-white')
                    }
                  >
                    {contact.category === 'authority' ? (
                      <Shield size={19} strokeWidth={1.9} />
                    ) : (
                      <Heart size={19} strokeWidth={1.9} />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="t-heading truncate text-ink">{contact.name}</p>
                    <p className="t-body truncate text-muted">
                      {contact.relationship || contact.role}
                    </p>
                    <p className="mt-1 truncate font-mono text-[12px] font-bold text-ink">
                      {contact.phone}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={getStatusTone(contact.notificationStatus)}>
                      {contact.notificationStatus}
                    </Badge>
                    {contact.isActive === false && <Badge tone="neutral">Paused</Badge>}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center gap-2 border-t border-[rgba(15,31,58,.06)] pt-3 dark:border-white/[.08]">
                  <LinkButton
                    href={`tel:${contact.phone}`}
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    icon={<Phone size={15} strokeWidth={1.9} />}
                  >
                    Call
                  </LinkButton>
                  <LinkButton
                    href={`sms:${contact.phone}`}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    icon={<MessageSquare size={15} strokeWidth={1.9} />}
                  >
                    Message
                  </LinkButton>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(contact)}
                    aria-label={`Edit ${contact.name}`}
                    className="press grid h-11 w-11 shrink-0 place-items-center rounded-ctl text-muted transition-colors duration-[160ms] hover:bg-[var(--surface-sunken)] hover:text-ink"
                  >
                    <Edit2 size={17} strokeWidth={1.9} />
                  </button>
                  {contact.category === 'trusted' && (
                    <button
                      type="button"
                      onClick={() => onDeleteContact(contact.id)}
                      aria-label={`Delete ${contact.name}`}
                      className="press grid h-11 w-11 shrink-0 place-items-center rounded-ctl text-muted transition-colors duration-[160ms] hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 size={17} strokeWidth={1.9} />
                    </button>
                  )}
                </div>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}

      {/* Add / Edit contact — bottom sheet */}
      <Sheet
        id="contact-form-sheet"
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingContact ? 'Edit contact' : 'Add emergency contact'}
        subtitle="They receive an SMS with your live location the moment SOS fires."
        footer={
          <div className="flex gap-2.5">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setIsAddModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" form="contact-form" variant="primary" fullWidth>
              {editingContact ? 'Save changes' : 'Save contact'}
            </Button>
          </div>
        }
      >
        <form id="contact-form" onSubmit={handleSubmit} className="space-y-3.5">
          <TextField
            label="Full name"
            type="text"
            required
            placeholder="e.g. Maria Dela Cruz"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />

          <TextField
            label="Phone number"
            type="tel"
            inputMode="tel"
            required
            placeholder="0917 123 4567 or +63 917 123 4567"
            value={formData.phone}
            error={phoneError || undefined}
            hint={phoneError ? undefined : 'PH mobile only — used for SOS text alerts.'}
            inputClassName="font-mono"
            onChange={(e) => {
              setPhoneError('');
              setFormData({ ...formData, phone: e.target.value });
            }}
          />

          <SelectField
            label="Role"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value as EmergencyContactItem['role'] })}
          >
            <option value="Family">Family Member</option>
            <option value="Friend">Trusted Friend</option>
            <option value="Guardian">Designated Guardian</option>
            <option value="Barangay Response Team">Barangay Response Team</option>
            <option value="VAWC Desk">VAWC Desk</option>
            <option value="Police / Emergency Response">Police / Emergency Response</option>
            <option value="Medical Response">Medical Response</option>
          </SelectField>

          <TextField
            label="Personal note"
            type="text"
            placeholder="e.g. Relationship or note"
            value={formData.relationship}
            onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
          />

          {/* Receive SOS texts */}
          <button
            type="button"
            onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
            role="switch"
            aria-checked={formData.isActive}
            className="press flex w-full items-center justify-between gap-3 rounded-field border-[1.5px] border-[rgba(15,31,58,.14)] px-3.5 py-3 text-left transition-colors duration-[160ms] dark:border-white/[.14]"
          >
            <span className="min-w-0">
              <span className="block text-[13px] font-extrabold text-ink">
                Receive SOS text alerts
              </span>
              <span className="t-body block text-muted">
                {formData.isActive ? 'Active — included in emergency SMS' : 'Paused — no SMS will be sent'}
              </span>
            </span>
            <span
              className={
                'track relative h-6 w-11 shrink-0 rounded-full ' +
                (formData.isActive ? 'bg-success' : 'bg-[rgba(15,31,58,.2)] dark:bg-white/20')
              }
            >
              <span
                className={
                  'knob absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-soft ' +
                  (formData.isActive ? 'translate-x-5' : 'translate-x-0')
                }
              />
            </span>
          </button>
        </form>
      </Sheet>
    </div>
  );
};
