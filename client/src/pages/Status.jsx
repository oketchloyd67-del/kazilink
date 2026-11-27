import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatKes, timeAgo } from '../lib.js';
import { useAutoRefreshOnReconnect, useDocumentTitle, useResource } from '../hooks.js';
import {
  EmptyState, ErrorState, Field, Icon, PageSkeleton, Spinner, StaleNotice, StatusPill, useToast,
} from '../components/ui.jsx';

export default function Status() {
  useDocumentTitle('WhatsApp status');
  const { data, loading, error, stale, reload } = useResource('/status/today');
  const [viewers, setViewers] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { push } = useToast();
  useAutoRefreshOnReconnect(reload);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const onFile = (event) => {
    const next = event.target.files?.[0] || null;
    setFile(next);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return next ? URL.createObjectURL(next) : '';
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    const count = Number.parseInt(viewers, 10);
    if (!Number.isFinite(count) || count < 1) {
      setFormError('Enter the number of people who viewed your status.');
      return;
    }
    if (!file) {
      setFormError('Attach a screenshot of your status viewers list.');
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('viewers', String(count));
      form.append('evidence', file);
      const result = await api(`/status/${data.product.id}/submit`, { method: 'POST', form });
      push(result.message, 'success', 7000);
      setViewers('');
      setFile(null);
      setPreview('');
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !data) return <PageSkeleton label="Loading today's product" cards={2} />;
  if (error && !data) {
    return (
      <div className="page-body">
        <ErrorState error={error} onRetry={reload} title="Today's product did not load" />
        {error.status === 403 && <div className="center mt-2"><Link to="/app/activate" className="btn btn-activate">Activate your account</Link></div>}
      </div>
    );
  }
  if (!data?.product) {
    return <EmptyState icon="share" title="Nothing to promote today" text="A new product is released each day. Check back tomorrow." />;
  }

  const { product, submission } = data;
  const estimated = Number.parseInt(viewers, 10) > 0 ? Number.parseInt(viewers, 10) * data.rewardPerViewerCents : 0;

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <h1 className="page-title">WhatsApp status</h1>
          <p>Post today&apos;s product and earn {formatKes(data.rewardPerViewerCents)} per verified viewer.</p>
        </div>
        {submission && <StatusPill status={submission.status} />}
      </div>

      {stale && <StaleNotice onRetry={reload} />}

      <div className="dash-grid">
        <div className="stack">
          <section className="product-card">
            <img className="product-image" src={product.imageUrl} alt={product.name} />
            <div className="product-body">
              <div className="row-between wrap">
                <h2 className="section-title">{product.name}</h2>
                <span className="product-price">{formatKes(product.priceCents)}</span>
              </div>
              <p className="small muted mt-1" style={{ lineHeight: 1.6 }}>{product.description}</p>
              <div className="row wrap mt-2">
                <a className="btn btn-ghost btn-sm" href={product.imageUrl} download={`${product.name.replace(/\s+/g, '-').toLowerCase()}.svg`}>
                  <Icon name="download" size={14} /> Save image
                </a>
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`${product.name} — ${product.description}`);
                      push('Product caption copied. Paste it with the image on your status.', 'success');
                    } catch {
                      push('Could not copy automatically. Select the description to copy it.', 'error');
                    }
                  }}
                >
                  <Icon name="copy" size={14} /> Copy caption
                </button>
              </div>
            </div>
          </section>

          <section className="card" aria-labelledby="steps-title">
            <div className="card-head">
              <div>
                <h3 id="steps-title">How to submit</h3>
                <p>Follow the steps in order.</p>
              </div>
            </div>
            <ul className="rules-list">
              {data.instructions.map((line) => (
                <li key={line}><Icon name="check" size={14} />{line}</li>
              ))}
            </ul>
          </section>
        </div>

        <div className="stack">
          {submission ? (
            <section className="card" aria-labelledby="submission-title">
              <div className="card-head">
                <div>
                  <h3 id="submission-title">Submission received</h3>
                  <p>{timeAgo(submission.createdAt)} · {submission.viewers.toLocaleString('en-KE')} viewers</p>
                </div>
                <StatusPill status={submission.status} />
              </div>
              <div className="kv">
                <div><span>Estimated reward</span><strong>{formatKes(submission.amountCents)}</strong></div>
                <div><span>Status</span><strong>{submission.status === 'pending' ? 'Awaiting review' : submission.status}</strong></div>
              </div>
              {submission.adminNote && <div className="mini-note warn mt-2">{submission.adminNote}</div>}
              <div className="mini-note mt-3">
                Rewards are credited after an admin checks your screenshot. You will get a notification when it happens.
              </div>
              <Link to="/app/wallet" className="btn btn-ghost btn-block mt-3">Go to wallet</Link>
            </section>
          ) : (
            <section className="card" aria-labelledby="submit-title">
              <div className="card-head">
                <div>
                  <h3 id="submit-title">Submit your status</h3>
                  <p>One submission per product.</p>
                </div>
              </div>
              <form className="stack" onSubmit={submit}>
                {formError && <div className="mini-note warn" role="alert">{formError}</div>}
                <Field label="Status viewers" hint="Use the number WhatsApp shows under the status.">
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="20000"
                    placeholder="e.g. 120"
                    value={viewers}
                    onChange={(event) => setViewers(event.target.value)}
                    required
                  />
                </Field>
                {estimated > 0 && (
                  <div className="mini-note">
                    Estimated reward: <strong>{formatKes(estimated)}</strong> before verification.
                  </div>
                )}
                <div className="field">
                  <span className="label" id="status-evidence-label">Viewers screenshot</span>
                  <label className="upload-zone" htmlFor="status-evidence">
                    <input
                      id="status-evidence"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={onFile}
                      aria-labelledby="status-evidence-label"
                    />
                    <Icon name="camera" size={22} />
                    <p>{file ? file.name : 'Tap to attach your screenshot (max 5MB)'}</p>
                  </label>
                  {preview && <img className="upload-preview" src={preview} alt="Preview of your status screenshot" />}
                </div>
                <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
                  {submitting ? <><Spinner small label="Submitting evidence" /> Uploading…</> : 'Submit for review'}
                </button>
                <div className="sr-only" role="status" aria-live="polite">
                  {submitting ? 'Uploading your screenshot. Please wait.' : ''}
                </div>
              </form>
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <div>
                <h3>Your status earnings</h3>
                <p>Withdraw from {formatKes(data.minimumWithdrawalCents, { decimals: false })}.</p>
              </div>
            </div>
            <div className="kv">
              <div><span>Available</span><strong>{formatKes(data.availableCents)}</strong></div>
              <div><span>Daily max</span><strong>{formatKes(data.maximumWithdrawalCents, { decimals: false })}</strong></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
