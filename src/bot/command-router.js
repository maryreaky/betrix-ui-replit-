export function routeTelegramCommand(message) {
  const text = (message.text || "").trim();
  const [cmd, ...args] = text.split(/\s+/);

  switch ((cmd || '').toLowerCase()) {
    case '/start':
      return { action: 'start', args };
    case '/help':
      return { action: 'help', args };
    case '/fixtures':
      return { action: 'fixtures', args };
    case '/odds':
      return { action: 'odds', args };
    case '/bet':
      return { action: 'bet', args };
    case '/pay':
      return { action: 'pay', args };
    case '/status':
      return { action: 'status', args };
    case '/settings':
      return { action: 'settings', args };
    case '/vvip':
      return { action: 'vvip', args };
    default:
      return { action: 'unknown', args, cmd };
  }
}
