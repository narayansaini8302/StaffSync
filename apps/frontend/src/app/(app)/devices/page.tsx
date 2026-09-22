'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Plus,
  Camera,
  Fingerprint,
  Smartphone,
  Globe,
  RefreshCw,
  PowerOff,
  Copy,
  Check,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Device, CreateDeviceResponse, DeviceType } from '@/lib/types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

const typeIcon = {
  CAMERA: Camera,
  FINGERPRINT: Fingerprint,
  MOBILE: Smartphone,
  WEB: Globe,
} as const;

export default function DevicesPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<CreateDeviceResponse | null>(
    null,
  );

  const query = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.get<{ data: Device[] }>('/api/devices'),
  });

  const rotate = useMutation({
    mutationFn: (deviceId: string) =>
      api.post<{ apiKeyId: string; plain: string }>(
        `/api/devices/${deviceId}/rotate`,
      ),
    onSuccess: (data, deviceId) => {
      const dev = query.data?.data.find((d) => d.id === deviceId);
      if (dev) {
        setJustCreated({ device: dev, apiKey: data.plain });
      }
      qc.invalidateQueries({ queryKey: ['devices'] });
    },
  });

  const deactivate = useMutation({
    mutationFn: (deviceId: string) => api.delete(`/api/devices/${deviceId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });

  const devices = query.data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Devices</h1>
          <p className="text-sm text-fg-2 mt-1">
            Registered kiosks, cameras, and scanners
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} />
          New Device
        </Button>
      </div>

      <div className="bg-surface border border-subtle rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-elevated/50 border-b border-subtle">
            <tr className="text-fg-2 text-left">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Keys</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  <Loader2 size={20} className="inline animate-spin" /> Loading...
                </td>
              </tr>
            )}
            {!query.isLoading && devices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No devices registered yet.
                </td>
              </tr>
            )}
            {devices.map((dev) => {
              const Icon = typeIcon[dev.type] ?? Camera;
              return (
                <tr
                  key={dev.id}
                  className="border-b border-subtle last:border-0 hover:bg-hover"
                >
                  <td className="px-4 py-3 text-fg">{dev.name}</td>
                  <td className="px-4 py-3 text-fg-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon size={14} />
                      {dev.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-fg-2">
                    {dev.location ?? '-'}
                  </td>
                  <td className="px-4 py-3">
                    {dev.isActive ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-success-soft text-success border border-success/30">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-elevated text-muted border border-subtle">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-2 text-xs">
                    {dev.apiKeys.length} active
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => rotate.mutate(dev.id)}
                        className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand"
                        title="Rotate key"
                      >
                        <RefreshCw size={14} />
                      </button>
                      {dev.isActive && (
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `Deactivate "${dev.name}"? All keys stop working.`,
                              )
                            ) {
                              deactivate.mutate(dev.id);
                            }
                          }}
                          className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-danger"
                          title="Deactivate"
                        >
                          <PowerOff size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CreateDeviceModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(resp) => {
          setCreating(false);
          setJustCreated(resp);
          qc.invalidateQueries({ queryKey: ['devices'] });
        }}
      />

      <ApiKeyModal resp={justCreated} onClose={() => setJustCreated(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create device modal
// ---------------------------------------------------------------------------

function CreateDeviceModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (resp: CreateDeviceResponse) => void;
}) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<DeviceType>('CAMERA');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName('');
      setLocation('');
      setType('CAMERA');
      setError(null);
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const resp = await api.post<CreateDeviceResponse>('/api/devices', {
        name,
        location: location || undefined,
        type,
      });
      onCreated(resp);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create device');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Device">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs text-fg-2 mb-1">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lobby Camera 1"
            className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          />
        </div>

        <div>
          <label className="block text-xs text-fg-2 mb-1">Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Main entrance"
            className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          />
        </div>

        <div>
          <label className="block text-xs text-fg-2 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DeviceType)}
            className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          >
            <option value="CAMERA">Camera (face recognition)</option>
            <option value="FINGERPRINT">Fingerprint reader</option>
            <option value="MOBILE">Mobile app</option>
            <option value="WEB">Web kiosk</option>
          </select>
        </div>

        {error && (
          <div className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            {busy ? 'Creating...' : 'Create Device'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// API key reveal modal (shown once)
// ---------------------------------------------------------------------------

function ApiKeyModal({
  resp,
  onClose,
}: {
  resp: CreateDeviceResponse | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!resp) return;
    try {
      await navigator.clipboard.writeText(resp.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <Modal
      open={!!resp}
      onClose={onClose}
      title={resp ? `API key for ${resp.device.name}` : ''}
    >
      {!resp ? null : (
        <div className="space-y-4">
          <div className="text-sm text-warning bg-warning-soft border border-warning/30 rounded-lg px-3 py-2">
            Copy this key now. It will <strong>not</strong> be shown again.
          </div>

          <div className="flex gap-2">
            <input
              readOnly
              value={resp.apiKey}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-xs font-mono focus:outline-none"
            />
            <Button onClick={copy} variant="secondary">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <div className="text-xs text-muted">
            Device ID: <span className="font-mono">{resp.device.id}</span>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
