import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatKes, timeAgo } from '../lib.js';
import { useAutoRefreshOnReconnect, useDocumentTitle, useResource } from '../hooks.js';
import {
  Confetti, ErrorState, Icon, PageSkeleton, PinModal, Spinner, StaleNotice, StatusPill, useToast,
} from '../components/ui.jsx';

function SudokuBoard({ game, onChange, disabled }) {
  const cells = game.puzzle.map((value) => (value ? String(value) : ''));
  const [entries, setEntries] = useState(() => {
    try {
      const raw = sessionStorage.getItem(`kazilink:sudoku:${game.id}`);
      return raw ? { ...cells, ...JSON.parse(raw) } : cells;
    } catch {
      return cells;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(`kazilink:sudoku:${game.id}`, JSON.stringify(entries));
    } catch {}
    onChange(entries);
  }, [entries]);

  const setCell = (index, raw) => {
    if (disabled) return;
    const digit = raw.replace(/[^1-9]/g, '').slice(-1);
    setEntries((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
  };

  const onKeyDown = (event, index) => {
    const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 9, ArrowUp: -9 };
    if (event.key in moves) {
      event.preventDefault();
      const target = index + moves[event.key];
      if (target >= 0 && target < 81) {
        document.getElementById(`sudoku-${game.id}-${target}`)?.focus();
      }
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      setCell(index, '');
    }
  };

  return (
    <div className="sudoku-grid" role="group" aria-label="Sudoku board">
      {entries.map((value, index) => {
        const given = Boolean(game.puzzle[index]);
        const row = Math.floor(index / 9) + 1;
        const col = (index % 9) + 1;
        return (
          <input
            key={index}
            id={`sudoku-${game.id}-${index}`}
            className={`sudoku-cell ${given ? 'given' : ''}`}
            value={value}
            readOnly={given || disabled}
            disabled={disabled}
            inputMode="numeric"
            maxLength={1}
            aria-label={`Row ${row}, column ${col}${given ? `, given ${value}` : ', empty'}`}
            onChange={(event) => setCell(index, event.target.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          />
        );
      })}
    </div>
  );
}

export default function Sudoku() {
  useDocumentTitle('Sudoku challenge');
  const { data, loading, error, stale, reload } = useResource('/sudoku');
  const [game, setGame] = useState(null);
  const [entries, setEntries] = useState([]);
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState(null);
  const [expired, setExpired] = useState(false);
  const { push } = useToast();
  const submittedRef = useRef(false);
  const expiredHandled = useRef(false);
  useAutoRefreshOnReconnect(reload);

  useEffect(() => {
    if (!data) return;
    if (data.activeGame) {
      const offset = new Date(data.activeGame.serverTime).getTime() - Date.now();
      setGame({
        ...data.activeGame,
        deadline: new Date(data.activeGame.expiresAt).getTime() - offset,
      });
      submittedRef.current = false;
      expiredHandled.current = false;
    } else {
      setGame(null);
    }
  }, [data]);

  useEffect(() => {
    if (!game) return undefined;
    const tick = () => {
      const left = Math.max(0, Math.ceil((game.deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !expiredHandled.current) {
        expiredHandled.current = true;
        setExpired(true);
        push('Time is up. Opening the next game…', 'info');
        window.setTimeout(() => reload(), 1200);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [game, push, reload]);

  const startGame = async (pin) => {
    setPaying(true);
    setPayError('');
    try {
      const res = await api('/sudoku/pay', { method: 'POST', body: { pin } });
      setPayOpen(false);
      push('Payment confirmed. You have 60 seconds!', 'success');
      const offset = new Date(res.game.serverTime).getTime() - Date.now();
      setGame({
        ...res.game,
        deadline: new Date(res.game.expiresAt).getTime() - offset,
      });
      setEntries([]);
      setResult(null);
      setExpired(false);
      submittedRef.current = false;
      expiredHandled.current = false;
      reload();
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPaying(false);
    }
  };

  const submit = async () => {
    if (!game || submitting) return;
    if (entries.filter(Boolean).length !== 81) {
      push('Fill every cell before submitting.', 'error');
      return;
    }
    setSubmitting(true);
    submittedRef.current = true;
    try {
      const res = await api(`/sudoku/${game.id}/submit`, {
        method: 'POST',
        body: { solution: entries.join('') },
      });
      setResult(res);
      push(res.message, res.won ? 'success' : 'info', 7000);
      reload();
    } catch (err) {
      submittedRef.current = false;
      push(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !data) return <PageSkeleton label="Loading Sudoku" cards={1} />;
  if (error && !data) {
    return (
      <div className="page-body">
        <ErrorState error={error} onRetry={reload} title="Sudoku did not load" />
        {error.status === 403 && <div className="center mt-2"><Link to="/app/activate" className="btn btn-activate">Activate your account</Link></div>}
      </div>
    );
  }
  if (!data) return null;

  const playing = Boolean(expired ? false : game);
  const totalCells = game?.puzzle.filter(Boolean).length || 0;
  const filled = entries.filter(Boolean).length;
  const canPay = data.gamesLeft > 0 && !playing;

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <h1 className="page-title">Sudoku challenge</h1>
          <p>Pay {formatKes(data.feeCents)} · Beat 60 seconds · Win {formatKes(data.feeCents * data.winMultiplier)}.</p>
        </div>
        <span className="id-chip">{data.gamesLeft} of {data.gamesPerDay} games left today</span>
      </div>

      {stale && <StaleNotice onRetry={reload} />}

      <div className="sudoku-wrap">
        <section className="card" aria-labelledby="board-title">
          <div className="card-head">
            <div>
              <h3 id="board-title">{game ? 'Your board' : 'Ready to play?'}</h3>
              <p>{game ? `${filled - totalCells} of ${81 - totalCells} cells filled` : 'Payment opens the board for 60 seconds.'}</p>
            </div>
            {game && (
              <div
                className="timer-ring"
                style={{ '--t': Math.round((remaining / data.seconds) * 100) }}
                role="timer"
                aria-live="off"
                aria-label={`${remaining} seconds remaining`}
              >
                <span aria-hidden="true">{remaining}s</span>
              </div>
            )}
          </div>

          {game ? (
            <>
              <div className="sudoku-board">
                <SudokuBoard
                  game={{ ...game, puzzle: game.puzzle.map((n) => Number(n)) }}
                  onChange={setEntries}
                  disabled={remaining === 0 || Boolean(result)}
                />
              </div>
              <div className="row wrap mt-3">
                <button
                  type="button"
                  className="btn btn-primary grow"
                  onClick={submit}
                  disabled={submitting || remaining === 0 || Boolean(result)}
                >
                  {submitting ? <><Spinner small label="Checking your solution" /> Checking…</> : 'Submit solution'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { setGame(null); setResult(null); reload(); }}
                  disabled={submitting}
                >
                  Leave board
                </button>
              </div>
              <div className="sr-only" role="status" aria-live="polite">
                {submitting ? 'Checking your solution. Please wait.' : `${remaining} seconds remaining`}
              </div>
            </>
          ) : (
            <div className="empty" style={{ padding: '28px 12px' }}>
              <div className="empty-icon"><Icon name="grid" size={21} /></div>
              <strong style={{ display: 'block', fontSize: '.92rem', color: 'var(--ink)' }}>
                {data.gamesLeft > 0 ? 'Three chances a day' : 'That is all three games for today'}
              </strong>
              <p className="mt-1">
                {data.gamesLeft > 0
                  ? 'Each entry costs KSh 30. Complete the grid in 60 seconds to triple it.'
                  : 'Come back tomorrow for three fresh boards.'}
              </p>
              {canPay && (
                <button type="button" className="btn btn-activate mt-3" onClick={() => { setPayError(''); setPayOpen(true); }}>
                  <Icon name="play" size={15} /> Play for {formatKes(data.feeCents)}
                </button>
              )}
            </div>
          )}
        </section>

        <div className="stack">
          <section className="card" aria-labelledby="sudoku-rules">
            <div className="card-head">
              <div>
                <h3 id="sudoku-rules">How it works</h3>
                <p>Fast, fair and instant.</p>
              </div>
            </div>
            <ul className="rules-list">
              <li><Icon name="wallet" size={14} />Pay {formatKes(data.feeCents)} per game with M-Pesa.</li>
              <li><Icon name="clock" size={14} />You have {data.seconds} seconds to fill every empty cell.</li>
              <li><Icon name="trophy" size={14} />Win and {data.winMultiplier}× your entry lands in your Sudoku balance instantly.</li>
              <li><Icon name="info" size={14} />Three games per day, and payouts withdraw from KSh 600.</li>
            </ul>
          </section>

          <section className="card" aria-labelledby="sudoku-history">
            <div className="card-head">
              <div>
                <h3 id="sudoku-history">Recent games</h3>
                <p>Last 10 results.</p>
              </div>
            </div>
            {data.history.length ? (
              <div className="tx-list">
                {data.history.map((item) => (
                  <div className="tx-row" key={item.id}>
                    <div className="tx-icon" style={{ background: item.status === 'won' ? 'var(--green-soft)' : 'var(--red-soft)', color: item.status === 'won' ? 'var(--green)' : 'var(--red)' }}>
                      <Icon name={item.status === 'won' ? 'trophy' : 'close'} size={14} />
                    </div>
                    <div className="tx-main">
                      <strong>Game #{item.id}</strong>
                      <span>{timeAgo(item.created_at)}</span>
                    </div>
                    <StatusPill status={item.status} />
                    <span className={`tx-amount ${item.payout_cents ? 'credit' : 'muted'}`}>
                      {item.payout_cents ? `+${formatKes(item.payout_cents)}` : `−${formatKes(item.fee_cents)}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small muted">No finished games yet.</p>
            )}
            <div className="kv mt-3">
              <div><span>Withdrawable</span><strong>{formatKes(data.withdrawableCents)}</strong></div>
              <div><span>Minimum payout</span><strong>{formatKes(data.withdrawal.minCents)}</strong></div>
            </div>
            <Link to="/app/wallet" className="btn btn-ghost btn-block mt-3">Withdraw from wallet</Link>
          </section>
        </div>
      </div>

      <PinModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onSubmit={startGame}
        amountCents={data.feeCents}
        title="Pay entry fee"
        description="An M-Pesa request is sent to your phone. Enter your PIN to open the Sudoku board."
        submitting={paying}
        error={payError}
        confirmLabel={`Pay ${formatKes(data.feeCents)}`}
      />

      {result && (
        <div className="toast-stack" aria-live="assertive">
          <div className={`toast ${result.won ? 'success' : 'info'}`} style={{ textAlign: 'left' }}>
            <Icon name={result.won ? 'trophy' : 'clock'} size={17} />
            <div>
              <strong>{result.won ? `You won ${formatKes(result.payoutCents)}!` : result.expired ? 'Time is up' : 'Not this time'}</strong>
              <div>{result.message}</div>
            </div>
            <button type="button" className="toast-close" onClick={() => setResult(null)} aria-label="Dismiss result">
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>
      )}
      {result?.won && <Confetti />}
    </div>
  );
}
