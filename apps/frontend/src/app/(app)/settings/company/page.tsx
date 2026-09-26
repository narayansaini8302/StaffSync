'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Save,
  Upload,
  Trash2,
  Building2,
  Image as ImageIcon,
} from 'lucide-react';
import { api, API_URL_CONST } from '@/lib/api';
import { Company, UpdateCompanyInput } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

export default function CompanySettingsPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<UpdateCompanyInput>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const query = useQuery({
    queryKey: ['company'],
    queryFn: () => api.get<Company>('/api/company'),
  });

  // Initialize form when data arrives
  useEffect(() => {
    if (query.data) {
      setForm({
        name: query.data.name,
        address: query.data.address ?? '',
        gstin: query.data.gstin ?? '',
        pan: query.data.pan ?? '',
        phone: query.data.phone ?? '',
        email: query.data.email ?? '',
        website: query.data.website ?? '',
        stateCode: query.data.stateCode ?? '',
        bankName: query.data.bankName ?? '',
        bankAccount: query.data.bankAccount ?? '',
        bankIfsc: query.data.bankIfsc ?? '',
        invoicePrefix: query.data.invoicePrefix ?? 'INV',
      });
    }
  }, [query.data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/api/company', form);
      qc.invalidateQueries({ queryKey: ['company'] });
      toast.success('Company profile saved');
    } catch (e: any) {
      toast.error('Save failed', e?.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/api/company/logo', formData);
      qc.invalidateQueries({ queryKey: ['company'] });
      toast.success('Logo uploaded');
    } catch (e: any) {
      toast.error('Upload failed', e?.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    if (!confirm('Remove the company logo?')) return;
    try {
      await api.delete('/api/company/logo');
      qc.invalidateQueries({ queryKey: ['company'] });
      toast.success('Logo removed');
    } catch (e: any) {
      toast.error('Remove failed', e?.message);
    }
  };

  if (query.isLoading || !query.data) {
    return (
      <div className="text-muted">
        <Loader2 size={20} className="inline animate-spin" /> Loading…
      </div>
    );
  }

  const company = query.data;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Building2 size={24} className="text-brand" />
        <div>
          <h1 className="text-2xl font-semibold text-fg">Company Profile</h1>
          <p className="text-sm text-fg-2 mt-1">
            Shown on all invoices, payslips, and letters
          </p>
        </div>
      </div>

      {/* Logo card */}
      <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-6">
        <h2 className="font-semibold text-fg mb-4">Company Logo</h2>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
          <div className="w-32 h-32 rounded-lg border border-subtle bg-app flex items-center justify-center overflow-hidden">
            {company.logoPath ? (
              <img
                src={API_URL_CONST + company.logoPath}
                alt="Company logo"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <ImageIcon size={32} className="text-muted" />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadLogo(f);
              }}
            />
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {company.logoPath ? 'Replace Logo' : 'Upload Logo'}
            </Button>

            {company.logoPath && (
              <Button variant="secondary" onClick={removeLogo}>
                <Trash2 size={14} />
                Remove
              </Button>
            )}

            <div className="text-xs text-muted mt-1">
              PNG, JPG, or WebP. Max 2 MB. Shown on all PDFs.
            </div>
          </div>
        </div>
      </div>

      {/* Profile form */}
      <form onSubmit={save} className="space-y-6">
        <div className="bg-surface border border-subtle rounded-xl p-6 space-y-4">
          <h2 className="font-medium text-fg">Business Details</h2>

          <Field
            label="Company name"
            value={form.name ?? ''}
            onChange={(v) => setForm({ ...form, name: v })}
            required
          />

          <div>
            <label className="block text-xs text-fg-2 mb-1">Address</label>
            <textarea
              rows={3}
              value={form.address ?? ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="GSTIN"
              value={form.gstin ?? ''}
              onChange={(v) => setForm({ ...form, gstin: v })}
              placeholder="27ABCDE1234F1Z5"
            />
            <Field
              label="PAN"
              value={form.pan ?? ''}
              onChange={(v) => setForm({ ...form, pan: v })}
              placeholder="ABCDE1234F"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="State code"
              value={form.stateCode ?? ''}
              onChange={(v) => setForm({ ...form, stateCode: v })}
              placeholder="27"
              hint="Two digits — used to decide CGST/SGST vs IGST"
            />
            <Field
              label="Phone"
              value={form.phone ?? ''}
              onChange={(v) => setForm({ ...form, phone: v })}
              placeholder="+91-9876543210"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Billing email"
              type="email"
              value={form.email ?? ''}
              onChange={(v) => setForm({ ...form, email: v })}
              placeholder="billing@company.com"
            />
            <Field
              label="Website"
              value={form.website ?? ''}
              onChange={(v) => setForm({ ...form, website: v })}
              placeholder="https://company.com"
            />
          </div>
        </div>

        {/* Bank details */}
        <div className="bg-surface border border-subtle rounded-xl p-6 space-y-4">
          <h2 className="font-medium text-fg">Bank Details</h2>
          <div className="text-xs text-muted">
            Shown on tax invoices so clients know where to pay
          </div>

          <Field
            label="Bank name"
            value={form.bankName ?? ''}
            onChange={(v) => setForm({ ...form, bankName: v })}
            placeholder="HDFC Bank"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Account number"
              value={form.bankAccount ?? ''}
              onChange={(v) => setForm({ ...form, bankAccount: v })}
              placeholder="1234567890"
            />
            <Field
              label="IFSC code"
              value={form.bankIfsc ?? ''}
              onChange={(v) => setForm({ ...form, bankIfsc: v })}
              placeholder="HDFC0001234"
            />
          </div>
        </div>

        {/* Invoice settings */}
        <div className="bg-surface border border-subtle rounded-xl p-6 space-y-4">
          <h2 className="font-medium text-fg">Invoice Settings</h2>
          <Field
            label="Invoice prefix"
            value={form.invoicePrefix ?? 'INV'}
            onChange={(v) => setForm({ ...form, invoicePrefix: v })}
            placeholder="INV"
            hint="Used to generate invoice numbers like INV-2026-0001"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {saving ? 'Saving…' : 'Save Profile'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-fg-2 mb-1">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
      />
      {hint && <div className="text-[10px] text-muted mt-1">{hint}</div>}
    </div>
  );
}