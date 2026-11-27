import { config } from '../config.js';


function apiUrl(path) {
  const base = config.tuma.baseUrl.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

async function tumaFetch(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(apiUrl(path), {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.tuma.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(config.tuma.accountId ? { 'X-Account-Id': config.tuma.accountId } : {}),
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      console.error('[tuma] request failed', res.status, data);
      throw new Error('Payment provider rejected the request.');
    }
    return data || {};
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The payment provider timed out. Please try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeStatus(data) {
  const raw = String(data?.status || data?.payment_status || data?.state || '').toLowerCase();
  if (['paid', 'success', 'successful', 'completed', 'confirmed'].includes(raw)) return 'paid';
  if (['failed', 'cancelled', 'canceled', 'declined', 'rejected'].includes(raw)) return 'failed';
  return 'pending';
}

export async function initiateCollection({ amountCents, phone, reference, purpose }) {
  if (!config.tuma.configured) {
    return {
      provider: 'tuma',
      providerRef: `sandbox_${Date.now().toString(36)}`,
      status: 'pending',
      sandbox: true,
    };
  }
  const data = await tumaFetch('/payments/collect', {
    method: 'POST',
    body: JSON.stringify({
      amount: amountCents,
      currency: 'KES',
      phone,
      reference,
      description: purpose === 'activation' ? 'KaziLink account activation' : 'KaziLink Sudoku entry',
      account_id: config.tuma.accountId || undefined,
    }),
  });
  const providerRef = data.id || data.reference || data.transaction_id || data.payment_id;
  if (!providerRef) throw new Error('Payment provider did not return a transaction reference.');
  return { provider: 'tuma', providerRef: String(providerRef), status: normalizeStatus(data), sandbox: false };
}

export async function checkCollectionStatus(providerRef) {
  if (!config.tuma.configured) {
    return { status: 'paid', providerRef };
  }
  const data = await tumaFetch(`/payments/${encodeURIComponent(providerRef)}`, { method: 'GET' });
  return { status: normalizeStatus(data), providerRef };
}

export async function confirmCollection({ providerRef, pin }) {
  if (!/^\d{4}$/.test(String(pin || ''))) {
    const err = new Error('Enter the 4-digit M-Pesa PIN to confirm the payment.');
    err.status = 400;
    throw err;
  }
  if (!config.tuma.configured) {
    return { status: 'paid', providerRef };
  }
  let last = { status: 'pending' };
  for (let attempt = 0; attempt < 4; attempt++) {
    last = await checkCollectionStatus(providerRef);
    if (last.status !== 'pending') break;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return last;
}
