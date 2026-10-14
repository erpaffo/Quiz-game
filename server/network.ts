import { networkInterfaces } from 'node:os';

export interface LanAddress {
  address: string;
  name: string;
  score: number;
}

// Schede virtuali che non portano ai telefoni (VirtualBox, VMware, WSL, Hyper-V, VPN…).
const VIRTUAL = /virtual|vmware|vbox|hyper-v|vethernet|wsl|loopback|docker|tailscale|zerotier|hamachi|vpn|tap|tun/i;
const WIFI = /wi-?fi|wlan|wireless|wl\w*|en0/i;

/**
 * Indirizzi IPv4 del PC raggiungibili dai telefoni, dal più probabile al meno probabile.
 * Funziona anche offline: con l'hotspot di un telefono il PC ha comunque un IP locale.
 */
export function lanAddresses(): LanAddress[] {
  const out: LanAddress[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const n of list ?? []) {
      if (n.family !== 'IPv4' || n.internal) continue;
      if (n.address.startsWith('169.254.')) continue; // nessun DHCP: indirizzo inutilizzabile
      let score = 0;
      if (WIFI.test(name)) score += 3;
      if (VIRTUAL.test(name)) score -= 5;
      if (n.address.startsWith('192.168.')) score += 2;
      else if (n.address.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(n.address)) score += 1;
      out.push({ address: n.address, name, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
