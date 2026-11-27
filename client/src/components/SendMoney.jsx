import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context.jsx';
import { formatKes } from '../lib.js';
import { Field, Icon, Modal, Spinner, useToast } from './ui.jsx';

export default function SendMoneyModal({ open, onClose, onSent, balanceCents = 0, ownId }) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const { refresh } = useAuth();
  const { push } = useToast();

  const reset = () => {
    setRecipient('');
    setAmount('');
    setNote('');
    setError('');
    setResult(null);
    setLoading(false);
  };

  const close = () => {
    if (loading) return;
    reset();
    onClose?.();
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < 100) {
      setError('Enter at least KSh 1.00 to send.');
      return;
    }
    if (cents > balanceCents) {
      setError('Your available balance is too low for this transfer.');
      return;
    }
    setLoading(true);
    try {
      const data = await api('/wallet/transfer', {
        method: 'POST',
        body: { recipient, amountCents: cents, note },
      });
      setResult(data);
      push(data.message, 'success');
      await refresh();
      onSent?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={result ? 'Money sent' : 'Send money'}
      description={result ? undefined : 'Transfer instantly to another KaziLink member using their user ID.'}
      size="sm"
      hideClose={loading}
    >
      {result ? (
        <>
          <div className="celebrate">
            <div className="celebrate-icon" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>
              <Icon name="send" size={34} />
            </div>
            <h2 style={{ fontSize: '1.2rem' }}>Transfer complete</h2>
            <p className="mt-1">{result.message}</p>
            <p className="small muted mt-2">New balance: <strong>{formatKes(result.balanceCents)}</strong></p>
          </div>
          <div className="modal-actions"><button className="btn btn-primary" onClick={close}>Done</button></div>
        </>
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="mini-note">
            Your ID: <strong>{ownId || '—'}</strong> · Available <strong>{formatKes(balanceCents)}</strong>
          </div>
          {error && <div className="mini-note warn">{error}</div>}
          <Field label="Recipient user ID" hint="Example: KZ-AB12CD">
            <input
              className="input"
              placeholder="KZ-XXXXXX"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value.toUpperCase())}
              autoCapitalize="characters"
              required
            />
          </Field>
          <Field label="Amount (KSh)">
            <div className="input-prefix">
              <span className="prefix">KSh</span>
              <input
                className="input"
                type="number"
                min="1"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </div>
          </Field>
          <Field label="Note (optional)">
            <input
              className="input"
              placeholder="What is this for?"
              maxLength={120}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <div className="tip-box">
            <Icon name="info" size={15} />
            Transfers are instant and cannot be reversed. Double-check the user ID before sending.
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={close} disabled={loading}>Cancel</button>
            <button className="btn btn-primary" disabled={loading}>
              {loading ? <><Spinner small /> Sending…</> : 'Send money'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
