/**
 * Bayani Contact API client — talks to the Express backend (port 8000)
 * so emergency contacts persist in the database (Turso or local SQLite).
 */

import { EmergencyContactItem } from '../types';

// Same Bridge backend as bridgeClient — defaults to the same host as the page.
const API_URL =
  import.meta.env.VITE_BRIDGE_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

export async function fetchContacts(): Promise<EmergencyContactItem[]> {
  const r = await fetch(`${API_URL}/contacts`);
  if (!r.ok) throw new Error('Failed to load contacts');
  const data = await r.json();
  return Array.isArray(data.contacts) ? data.contacts : [];
}

export async function createContactRemote(contact: EmergencyContactItem): Promise<void> {
  const r = await fetch(`${API_URL}/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact),
  });
  if (!r.ok) throw new Error('Failed to save contact');
}

export async function updateContactRemote(contact: EmergencyContactItem): Promise<void> {
  const r = await fetch(`${API_URL}/contacts/${encodeURIComponent(contact.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact),
  });
  if (!r.ok) throw new Error('Failed to update contact');
}

export async function deleteContactRemote(contactId: string): Promise<void> {
  const r = await fetch(`${API_URL}/contacts/${encodeURIComponent(contactId)}`, {
    method: 'DELETE',
  });
  if (!r.ok) throw new Error('Failed to delete contact');
}