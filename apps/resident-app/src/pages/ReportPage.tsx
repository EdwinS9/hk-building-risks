import { useState, useRef } from 'react';
import { Camera, Send, CheckCircle, AlertTriangle, X } from 'lucide-react';
import type { Page } from '../types';
import { getHomeBuilding } from '../lib/storage';
import { supabase } from '../lib/supabase';

interface Props {
  onNavigate: (page: Page) => void;
}

type Status = 'idle' | 'uploading' | 'submitting' | 'success' | 'error';

export default function ReportPage({ onNavigate }: Props) {
  const home = getHomeBuilding();
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!home) {
    return (
      <div className="page center-content">
        <AlertTriangle size={48} className="muted-icon" />
        <h2>No building selected</h2>
        <p className="muted">Please select your home building in Settings first.</p>
        <button className="btn-primary" onClick={() => onNavigate('settings')}>
          Go to Settings
        </button>
      </div>
    );
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    setPhoto(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (description.trim().length < 5) return;

    setStatus('uploading');
    setErrorMsg('');

    let photoUrl: string | null = null;

    if (photo) {
      const ext = photo.name.split('.').pop() ?? 'jpg';
      const path = `${home!.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('resident-report-photos')
        .upload(path, photo, { contentType: photo.type, upsert: false });

      if (uploadError) {
        setStatus('error');
        setErrorMsg('Photo upload failed. Please try again.');
        return;
      }

      const { data: urlData } = supabase.storage
        .from('resident-report-photos')
        .getPublicUrl(path);
      photoUrl = urlData.publicUrl;
    }

    setStatus('submitting');

    const { error } = await supabase.from('resident_reports').insert({
      block_id: home!.id,
      description: description.trim(),
      photo_url: photoUrl,
    });

    if (error) {
      setStatus('error');
      setErrorMsg('Submission failed. Please check your connection and try again.');
      return;
    }

    setStatus('success');
  }

  if (status === 'success') {
    return (
      <div className="page center-content">
        <CheckCircle size={64} className="success-icon" />
        <h2>Report submitted</h2>
        <p className="muted">Thank you. Your report has been received.</p>
        <button
          className="btn-primary"
          onClick={() => {
            setDescription('');
            removePhoto();
            setStatus('idle');
            onNavigate('home');
          }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  const busy = status === 'uploading' || status === 'submitting';

  return (
    <div className="page">
      <div className="page-header">
        <h1>Report an Issue</h1>
        <p className="muted">{home.address}</p>
      </div>

      <form onSubmit={handleSubmit} className="report-form">
        <label className="field-label">
          Describe the issue
          <textarea
            className="textarea"
            rows={6}
            placeholder="e.g. Large crack in the stairwell wall on floor 3, visible since last week…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            required
            disabled={busy}
          />
          <span className="char-count">{description.length} / 2000</span>
        </label>

        <div className="photo-section">
          <p className="field-label">Photo (optional)</p>
          {photoPreview ? (
            <div className="photo-preview-wrap">
              <img src={photoPreview} alt="Preview" className="photo-preview" />
              <button
                type="button"
                className="photo-remove"
                onClick={removePhoto}
                aria-label="Remove photo"
                disabled={busy}
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="photo-pick-btn"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Camera size={22} />
              Take / Choose Photo
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden-input"
            onChange={handlePhotoChange}
          />
        </div>

        {status === 'error' && (
          <div className="error-banner">
            <AlertTriangle size={16} />
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary submit-btn"
          disabled={busy || description.trim().length < 5}
        >
          {busy ? (
            <span className="spinner" />
          ) : (
            <Send size={18} />
          )}
          {status === 'uploading' ? 'Uploading photo…' : status === 'submitting' ? 'Submitting…' : 'Submit Report'}
        </button>
      </form>
    </div>
  );
}
