import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context.jsx';
import { timeAgo } from '../lib.js';
import { Field, Icon, Spinner, useToast } from './ui.jsx';

const CATEGORIES = [
  ['account', 'Account and activation'],
  ['payment', 'Payments and withdrawals'],
  ['training', 'Training academy'],
  ['security', 'Security or unauthorised access'],
  ['technical', 'App or notification problem'],
  ['other', 'Something else'],
];

export default function ChatWidget() {
  const { user } = useAuth();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('chat');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      text: 'Hi, I can answer questions about activation, earning, withdrawals, training, two-factor authentication and account safety. What do you need help with?',
      suggestions: ['How do I activate my account?', 'What are the withdrawal limits?', 'Tell me about the training courses', 'How do I enable notifications?'],
    },
  ]);
  const [escalate, setEscalate] = useState(false);
  const [requestText, setRequestText] = useState('');
  const [category, setCategory] = useState('account');
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketBusy, setTicketBusy] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }), 60);
  }, [messages, open, escalate]);

  useEffect(() => {
    if (!open || tab !== 'requests') return;
    setTicketsLoading(true);
    api('/support/messages')
      .then((data) => setTickets(data.messages))
      .catch(() => {})
      .finally(() => setTicketsLoading(false));
  }, [open, tab]);

  if (!user || user.role === 'admin') return null;

  const ask = async (text) => {
    const question = String(text || input).trim();
    if (!question || busy) return;
    setMessages((list) => [...list, { role: 'user', text: question }]);
    setInput('');
    setBusy(true);
    setEscalate(false);
    try {
      const data = await api('/support/chat', { method: 'POST', body: { message: question } });
      setMessages((list) => [...list, {
        role: 'bot',
        text: data.reply,
        title: data.title,
        suggestions: data.suggestions || [],
        escalate: data.escalate,
      }]);
      if (data.escalate) {
        setEscalate(true);
        setRequestText(question);
      }
    } catch (error) {
      setMessages((list) => [...list, { role: 'bot', text: error.message, escalate: true }]);
      setEscalate(true);
    } finally {
      setBusy(false);
    }
  };

  const sendRequest = async (event) => {
    event.preventDefault();
    if (requestText.trim().length < 10) {
      push('Write a little more so the team can help you.', 'error');
      return;
    }
    setTicketBusy(true);
    try {
      const data = await api('/support/message', { method: 'POST', body: { message: requestText.trim(), category } });
      push(data.message, 'success', 6000);
      setEscalate(false);
      setRequestText('');
      setMessages((list) => [...list, { role: 'bot', text: data.message }]);
    } catch (error) {
      push(error.message, 'error');
    } finally {
      setTicketBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`chat-fab ${open ? 'open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close KaziLink assistant' : 'Open KaziLink assistant'}
        aria-expanded={open}
        aria-controls="kazi-chat-panel"
      >
        <Icon name={open ? 'close' : 'message'} size={22} />
      </button>

      {open && (
        <section className="chat-panel" id="kazi-chat-panel" aria-label="KaziLink assistant">
          <header className="chat-head">
            <div className="chat-avatar"><Icon name="spark" size={18} /></div>
            <div className="grow">
              <strong>KaziLink assistant</strong>
              <span>Quick answers about the app</span>
            </div>
            <button type="button" className="btn-icon round" onClick={() => setOpen(false)} aria-label="Close assistant">
              <Icon name="close" size={16} />
            </button>
          </header>

          <div className="chat-tabs" role="group" aria-label="Assistant sections">
            <button type="button" className={tab === 'chat' ? 'active' : ''} aria-pressed={tab === 'chat'} onClick={() => setTab('chat')}>Chat</button>
            <button type="button" className={tab === 'requests' ? 'active' : ''} aria-pressed={tab === 'requests'} onClick={() => setTab('requests')}>My requests</button>
          </div>

          {tab === 'chat' ? (
            <>
              <div className="chat-log" ref={logRef} aria-live="polite">
                {messages.map((message, index) => (
                  <div key={index} className={`chat-bubble ${message.role}`}>
                    {message.title && <span className="chat-title">{message.title}</span>}
                    <p>{message.text}</p>
                    {message.suggestions?.length > 0 && (
                      <div className="chat-suggestions">
                        {message.suggestions.map((suggestion) => (
                          <button type="button" key={suggestion} onClick={() => ask(suggestion)}>{suggestion}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {busy && (
                  <div className="chat-bubble bot chat-typing" role="status">
                    <Spinner small label="Checking the answer" /> Checking the answer…
                  </div>
                )}
              </div>

              {escalate ? (
                <form className="chat-escalate" onSubmit={sendRequest}>
                  <strong>Send this request to the team</strong>
                  <p className="tiny muted">The admin inbox receives your account details with the message. Replies appear in notifications.</p>
                  <Field label="Category">
                    <select className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
                      {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Your request">
                    <textarea
                      className="textarea"
                      maxLength={2000}
                      value={requestText}
                      onChange={(event) => setRequestText(event.target.value)}
                      placeholder="Explain what happened and what you need help with."
                    />
                  </Field>
                  <div className="row">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEscalate(false)} disabled={ticketBusy}>Back to chat</button>
                    <button type="submit" className="btn btn-primary btn-sm grow" disabled={ticketBusy}>
                      {ticketBusy ? <><Spinner small label="Sending request" /> Sending…</> : 'Send to the team'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <form className="chat-input-row" onSubmit={(event) => { event.preventDefault(); ask(); }}>
                    <label className="sr-only" htmlFor="chat-input">Ask a question</label>
                    <input
                      id="chat-input"
                      className="input"
                      placeholder="Ask about the app…"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      maxLength={500}
                    />
                    <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()} aria-label="Send question">
                      <Icon name="send" size={16} />
                    </button>
                  </form>
                  <button type="button" className="chat-team-link" onClick={() => { setEscalate(true); setRequestText(input); }}>
                    Bot cannot help? Send a request to the team
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="chat-log">
              {ticketsLoading ? (
                <div className="chat-bubble bot" role="status"><Spinner small label="Loading requests" /> Loading your requests…</div>
              ) : tickets.length ? (
                tickets.map((ticket) => (
                  <article className="chat-ticket" key={ticket.id}>
                    <div className="row-between">
                      <strong>#{ticket.id} · {ticket.category}</strong>
                      <span className={`pill ${ticket.status}`}>{ticket.status === 'open' ? 'Awaiting reply' : ticket.status}</span>
                    </div>
                    <p>{ticket.message}</p>
                    <span className="tiny muted">{timeAgo(ticket.created_at)}</span>
                    {ticket.admin_reply && (
                      <div className="chat-reply">
                        <strong>KaziLink support</strong>
                        <p>{ticket.admin_reply}</p>
                        <span className="tiny muted">{timeAgo(ticket.replied_at)}</span>
                      </div>
                    )}
                  </article>
                ))
              ) : (
                <div className="chat-bubble bot">You have not sent a support request yet. Ask a question first, then send it to the team if needed.</div>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
