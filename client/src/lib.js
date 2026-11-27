export function formatKes(cents, { decimals = true } = {}) {
  const value = (Number(cents) || 0) / 100;
  return `KSh ${value.toLocaleString('en-KE', {
    minimumFractionDigits: decimals && value % 1 !== 0 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function initials(first, last) {
  return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase();
}

export function passwordStrength(password = '') {
  const checks = [
    { key: 'length', label: '8+ characters', pass: password.length >= 8 },
    { key: 'case', label: 'Upper & lowercase', pass: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { key: 'number', label: 'A number', pass: /\d/.test(password) },
    { key: 'symbol', label: 'A symbol', pass: /[^A-Za-z0-9]/.test(password) },
    { key: 'long', label: '12+ characters', pass: password.length >= 12 },
  ];
  const passed = checks.filter((c) => c.pass).length;
  let score = 0;
  if (passed >= 1) score = 1;
  if (passed >= 3) score = 2;
  if (passed >= 4) score = 3;
  if (passed >= 5) score = 4;
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[score], checks };
}

export function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
  return Promise.resolve();
}

export const STATUS_LABELS = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  paid: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  won: 'Won',
  lost: 'Lost',
  playing: 'In progress',
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
};

export function titleCase(value = '') {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function nairobiDayLabel() {
  return new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function timeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function greetingFor(username, date = new Date()) {
  return `${timeGreeting(date)}, @${username}`;
}
