const ARTICLES = [
  {
    id: 'activation',
    title: 'Account activation',
    keywords: ['activate', 'activation', 'inactive', '100', 'unlock', 'fee', 'account active'],
    answer: 'Activation is a one-time payment of KSh 100. Open Activation, confirm your M-Pesa number, approve the STK prompt on your phone, then enter the 6-digit code sent to your email. Once activated, videos, creator tasks, WhatsApp status tasks, affiliate marketing, Sudoku and the Academy are unlocked.',
    followUps: ['Why is my account inactive?', 'I did not receive the activation code', 'What does activation unlock?'],
  },
  {
    id: 'withdrawals',
    title: 'Withdrawals',
    keywords: ['withdraw', 'withdrawal', 'payout', 'mpesa', 'm-pesa', 'minimum', 'maximum', 'limit', 'pending'],
    answer: 'Withdrawals are requested from the Wallet. Each activity has its own limits: affiliate KSh 250–1,500, videos KSh 1,000–2,500, WhatsApp status KSh 2,000–5,000, Sudoku KSh 600–1,200 and wallet balance KSh 100–5,000 per day. Requests are reserved from your balance and reviewed by an admin. If a request is cancelled or rejected, the money is returned to your balance automatically.',
    followUps: ['Why is my withdrawal pending?', 'Can I withdraw to crypto?', 'What are the withdrawal limits?'],
  },
  {
    id: 'crypto',
    title: 'Crypto withdrawals',
    keywords: ['crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'usdt', 'solana', 'wallet address', 'address'],
    answer: 'You can request a crypto payout from the Wallet by choosing “Send to crypto wallet”, selecting the network and pasting your receiving address. Crypto withdrawals need admin approval just like M-Pesa requests. Check the network carefully: funds sent to a wrong address or wrong network cannot be recovered.',
    followUps: ['Is crypto withdrawal approved automatically?', 'Which networks are supported?', 'What is the minimum withdrawal?'],
  },
  {
    id: 'training',
    title: 'Training Academy',
    keywords: ['training', 'course', 'academy', 'cyber', 'security', 'web development', 'penetration', 'pentest', 'class', 'enrol', 'enroll', 'room'],
    answer: 'The Academy has three 12-week tracks: Cyber Security Fundamentals at KSh 1,200, Web Development Bootcamp at KSh 1,800 and Ethical Penetration Testing at KSh 2,500. Each payment covers a 3-month term. After payment is confirmed, your training room link opens in the Academy. Classes run on fixed days: Cyber Security on Monday and Wednesday 7–9 PM, Web Development on Tuesday and Thursday 7–9 PM, and Penetration Testing on Saturday 10 AM–1 PM. Renew before the term ends to keep access.',
    followUps: ['How much is the cybersecurity course?', 'When are the training days?', 'How do I renew my training?'],
  },
  {
    id: 'leaderboard',
    title: 'Withdrawal leaderboard',
    keywords: ['leaderboard', 'leader board', 'top withdrawer', 'ranking', 'voucher', '1000', 'coupon', 'competition'],
    answer: 'The leaderboard ranks members by approved withdrawals each month. The top withdrawer at the end of the month receives a KSh 1,000 coupon voucher. To receive the voucher you must claim it from the Leaderboard page; claiming requires a KSh 100 activation payment from your wallet and an active account. The voucher code is shown after activation and is valid for 90 days.',
    followUps: ['How do I claim the voucher?', 'Where do I see my rank?', 'When does the leaderboard reset?'],
  },
  {
    id: 'twofa',
    title: 'Two-factor authentication',
    keywords: ['2fa', 'two factor', 'two-factor', 'authenticator', 'otp', 'verification', 'google authenticator', 'authy'],
    answer: 'Open Account → Security to choose your two-factor method. Email sends a code when you sign in from a new device or location. Authenticator app requires a 6-digit code from Google Authenticator, Authy or any TOTP app on every sign-in. KaziLink will never ask for your M-Pesa PIN or your KaziLink password by email or chat.',
    followUps: ['How do I enable an authenticator app?', 'I lost my authenticator code', 'Why did I get a login code?'],
  },
  {
    id: 'password',
    title: 'Changing your password',
    keywords: ['password', 'change password', 'forgot', 'reset', 'log in', 'login'],
    answer: 'Signed-in members can change their password under Account → Security → Change password. Enter your current password, choose a new one, then confirm with the code from your chosen 2FA method. Admins change their password from the Account tab in the admin console. If you are locked out, use the support form and the team will review your request.',
    followUps: ['How do I change my password?', 'I forgot my password', 'Why must I confirm with a code?'],
  },
  {
    id: 'videos',
    title: 'Watch and earn',
    keywords: ['video', 'watch', 'creator', 'task', 'follow', 'like', 'comment', 'share', 'screenshot', 'evidence'],
    answer: 'One new video is posted each day. Watch it in full to earn the daily reward, then complete creator tasks such as follow, like, comment or share. Upload a screenshot as evidence. Task rewards are credited after an admin verifies the screenshot, usually the same day. Duplicate or fake evidence is rejected.',
    followUps: ['Why was my task rejected?', 'How much is today’s video worth?', 'I did not get a task notification'],
  },
  {
    id: 'status',
    title: 'WhatsApp status tasks',
    keywords: ['status', 'whatsapp', 'product', 'viewers', 'promote', 'share product'],
    answer: 'The product of the day appears under WhatsApp status. Save the image, post it on your WhatsApp status, then submit a screenshot of the viewers list with the viewer count. You earn KSh 15 per verified viewer after admin approval. Rewards go into the WhatsApp status withdrawal bucket.',
    followUps: ['How many viewers do I need?', 'Why is my status pending?', 'Where do I find today’s product?'],
  },
  {
    id: 'affiliate',
    title: 'Affiliate marketing',
    keywords: ['affiliate', 'refer', 'referral', 'invite', 'commission', '20%', 'link'],
    answer: 'Share your personal referral link from the Affiliate page. When someone joins with your link and activates their account, you earn 20% commission instantly. The affiliate withdrawal minimum is KSh 250. Commission is credited to your wallet and can be withdrawn after admin approval.',
    followUps: ['Where is my referral link?', 'When do I get commission?', 'What is the affiliate withdrawal minimum?'],
  },
  {
    id: 'sudoku',
    title: 'Sudoku challenge',
    keywords: ['sudoku', 'game', 'puzzle', 'grid', 'win', '90', '30'],
    answer: 'Sudoku costs KSh 30 per board and you can play three boards a day. Complete the grid in 60 seconds. A correct solution triples your entry to KSh 90, credited instantly to your Sudoku balance. The Sudoku withdrawal minimum is KSh 600.',
    followUps: ['How many Sudoku games can I play?', 'What happens if time runs out?', 'How do I pay for Sudoku?'],
  },
  {
    id: 'payments',
    title: 'M-Pesa payments and receipts',
    keywords: ['payment', 'pay', 'stk', 'pin', 'receipt', 'email receipt', 'money deducted', 'failed payment'],
    answer: 'KaziLink uses an M-Pesa STK prompt. Enter your PIN only on your own handset. The app never sees or stores your M-Pesa PIN. If a payment fails, no access is granted and the payment record shows failed; you can start a new request. Successful payments generate an in-app notification and an email receipt when email delivery is configured.',
    followUps: ['My payment was deducted but not confirmed', 'I did not get a receipt', 'Is my M-Pesa PIN safe?'],
  },
  {
    id: 'notifications',
    title: 'Notifications and email',
    keywords: ['notification', 'notify', 'push', 'bell', 'email', 'updates', 'new task', 'alerts'],
    answer: 'Enable notifications from Account → Notifications or the banner at the top of the app. Once allowed, new tasks, rewards, payment receipts and withdrawal updates arrive as phone notifications. Email notifications are sent for payments and withdrawals. You can manage notification permission in your phone settings at any time.',
    followUps: ['How do I enable phone notifications?', 'Why am I not receiving emails?', 'Can I turn notifications off?'],
  },
  {
    id: 'transfers',
    title: 'Sending money to members',
    keywords: ['send money', 'transfer', 'send funds', 'user id', 'p2p'],
    answer: 'Open Wallet → Send money, enter the recipient’s KaziLink user ID (for example KZ-AB12CD) and the amount. Transfers between active members are instant and cannot be reversed. You cannot send to yourself or to a suspended account.',
    followUps: ['Where do I find my user ID?', 'Can I cancel a transfer?', 'Why can’t I send money?'],
  },
  {
    id: 'security',
    title: 'Account safety',
    keywords: ['hack', 'hacked', 'scam', 'safe', 'security', 'stolen', 'fraud', 'suspicious', 'unauthorised', 'unauthorized'],
    answer: 'KaziLink uses secure sessions, rate limiting, two-factor authentication and admin review for payouts. Never share your password, OTP or M-Pesa PIN with anyone, including someone claiming to be staff. If you notice unfamiliar activity, change your password and sign out everywhere from Account → Security, then send a support request immediately.',
    followUps: ['How do I sign out everywhere?', 'Someone logged into my account', 'Does KaziLink ask for my PIN?'],
  },
  {
    id: 'inactive-deletion',
    title: 'Inactive accounts',
    keywords: ['delete account', 'deletion', '24 hours', 'inactive notice', 'remove account', 'close account'],
    answer: 'Inactive accounts do not have access to earning features. The team may send a 24-hour activation notice before removing accounts that remain inactive. Activate within that window to keep your account. If you want your account deleted, send a support request and an admin will review it.',
    followUps: ['Why did I get a deletion notice?', 'How do I activate my account?', 'Can I delete my account?'],
  },
  {
    id: 'legal',
    title: 'Terms, privacy and cookies',
    keywords: ['terms', 'privacy', 'cookie', 'cookies', 'data', 'policy', 'legal'],
    answer: 'The Terms and Conditions, Privacy Policy and cookie notice are linked in the app footer and in Account. KaziLink uses essential cookies for secure sessions and stores preferences on your device. You can accept the cookie notice to continue; essential session cookies are required for sign-in.',
    followUps: ['Where is the privacy policy?', 'What cookies do you use?', 'How do I accept cookies?'],
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp channel',
    keywords: ['whatsapp channel', 'channel', 'updates', 'announcements', 'community'],
    answer: 'Use the floating WhatsApp button on any page to open the official KaziLink channel. Announcements, maintenance notices and new opportunities are shared there. The channel is read-only for members; private account issues should go through the support form in this chat.',
    followUps: ['Where is the WhatsApp channel?', 'How do I get announcements?', 'Can I chat with the team?'],
  },
  {
    id: 'support',
    title: 'Talking to the team',
    keywords: ['support', 'help', 'human', 'team', 'message', 'complain', 'request', 'contact'],
    answer: 'If this assistant cannot solve your issue, use the “Send a request” form in this panel. Your message goes to the admin inbox with your account details, and you will receive a notification when it is answered. There are no public phone or email contacts displayed in the app, which keeps support requests verified and traceable.',
    followUps: ['Send my request to the team', 'How long does support take?', 'Where do I see replies?'],
  },
];

function normalise(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function answerQuestion(message) {
  const text = normalise(message);
  if (!text) {
    return {
      reply: 'Ask me anything about activation, earning, withdrawals, training, 2FA, notifications or account safety.',
      suggestions: ['How do I activate my account?', 'What are the withdrawal limits?', 'Tell me about the training courses', 'How do I enable notifications?'],
      escalate: false,
      matched: null,
    };
  }

  let best = null;
  let bestScore = 0;
  for (const article of ARTICLES) {
    let score = 0;
    for (const keyword of article.keywords) {
      if (text.includes(keyword)) score += keyword.includes(' ') ? 3 : 2;
    }
    if (text.includes(normalise(article.title))) score += 3;
    if (score > bestScore) {
      best = article;
      bestScore = score;
    }
  }

  if (!best || bestScore < 2) {
    return {
      reply: 'I could not match that to a KaziLink topic yet. I can help with activation, videos, status tasks, affiliate, Sudoku, withdrawals, crypto payouts, the Academy, the leaderboard, 2FA, notifications, password changes and security. You can also send the request to the team and an admin will reply.',
      suggestions: ['How do I activate my account?', 'What are the withdrawal limits?', 'Tell me about the training courses', 'Send my request to the team'],
      escalate: true,
      matched: null,
    };
  }

  return {
    reply: best.answer,
    title: best.title,
    suggestions: best.followUps,
    escalate: false,
    matched: best.id,
  };
}

export const TOPICS = ARTICLES.map(({ id, title }) => ({ id, title }));
