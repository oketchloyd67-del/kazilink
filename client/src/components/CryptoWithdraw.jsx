import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatKes } from '../lib.js';
import { Field, Icon, Modal, Spinner, useToast } from './ui.jsx';

export default function CryptoWithdrawModal({ open, onClose, onSubmitted, balanceCents = 0 }) {
  const { push } = useToast();
  const [options, setOptions] = useState(null);
  const [amount, setAmount] = useState('');
  const [network, setNetwork] = useState('Bitcoin (BTC)');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) {
      setAmount('');
      setAddress('');
      setError('');
      setResult(null);
      setLoading(false);
      return;
    }
    api('/withdrawals/options')
      .then((data) => {
        setOptions(data);
        setNetwork(data.crypto?.networks?.[0] || 'Bitcoin (BTC)');
      })
      .catch((err) => setError(err.message));
  }, [open]);

  const amountCents = Math.round((Number(amount) || 0) * 100);
  const minimum = options?.crypto?.minCents || 10000;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (amountCents < minimum) {
      setError(`Minimum crypto withdrawal is ${formatKes(minimum)}.`);
      return;
    }
    if (amountCents > balanceCents) {
      setError('Your available balance is too low for this withdrawal.');
      return;
    }
    if (address.trim().length < 20) {
      setError('Paste the full receiving address for the selected network.');
      return;
    }
    setLoading(true);
    try {
      const data = await api('/withdraw/crypto', {
        method: 'POST',
        body: { amountCents, network, address: address.trim() },
      });
      setResult(data);
      push('Crypto withdrawal requested. It is pending admin approval.', 'success');
      onSubmitted?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <Modal open={open} onClose={onClose} title="Crypto withdrawal requested" size="sm">
        <div className="celebrate">
          <div className="celebrate-icon" style={{ background: 'var(--orange-soft)', color: 'var(--orange)' }}>
            <Icon name="clock" size={36} />
          </div>
          <h2 style={{ fontSize: '1.2rem' }}>Pending approval</h2>
          <p className="mt-1">
            {formatKes(result.withdrawal.amountCents)} will be sent in {result.withdrawal.network} once an admin approves the request.
          </p>
          <div className="mini-note mt-3">
            Address: <code style={{ overflowWrap: 'anywhere' }}>{result.withdrawal.address}</code>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onClose}
      title="Send to a crypto wallet"
      description="The payout is converted and sent after admin approval. Crypto transfers cannot be reversed."
      size="lg"
      hideClose={loading}
    >
      <form className="stack" onSubmit={submit}>
        {error && <div className="mini-note warn" role="alert">{error}</div>}
        <div className="mini-note">
          Available <strong>{formatKes(balanceCents)}</strong> · minimum {formatKes(minimum)}
        </div>
        <Field label="Amount (KSh)" hint="This amount is deducted from your wallet while the request is pending.">
          <div className="input-prefix">
            <span className="prefix">KSh</span>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </div>
        </Field>
        <Field label="Network" hint="Use the same network as the receiving wallet.">
          <select className="select" value={network} onChange={(event) => setNetwork(event.target.value)}>
            {(options?.crypto?.networks || []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Receiving address" hint="Paste the full public address. We never ask for a seed phrase or private key.">
          <input
            className="input"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Paste wallet address"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </Field>
        <div className="mini-note warn">
          <Icon name="alert" size={13} /> Check the address and network carefully. Funds sent to a wrong address or network cannot be recovered.
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <><Spinner small label="Submitting crypto withdrawal" /> Submitting…</> : 'Request crypto withdrawal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
