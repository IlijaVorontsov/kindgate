#!/usr/bin/env python3
"""Snapshot the bundled pause lists from StevenBlack/hosts (MIT).

    python3 scripts/lists.py            # refresh lists/*.txt (downloads)
    python3 scripts/lists.py --refilter # apply EXCLUDE to the snapshots already
                                        # in lists/, without the network

The extension makes no network calls, so the lists are frozen at release time
and refreshed by re-running this script on a branch. Each hosts file is reduced
to one domain per line, lower-case, with the `0.0.0.0` prefix and localhost
noise dropped, and with any entry whose parent domain is also listed removed:
the pause matcher already treats a listed domain as covering its subdomains.
"""
import datetime
import pathlib
import sys
import urllib.request

SRC = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/{}-only/hosts'
LISTS = {'adult': 'porn', 'social': 'social', 'gambling': 'gambling'}
NOISE = {'localhost', 'localhost.localdomain', 'local', 'broadcasthost', 'ip6-localhost',
         'ip6-loopback', 'ip6-localnet', 'ip6-mcastprefix', 'ip6-allnodes', 'ip6-allrouters',
         'ip6-allhosts', '0.0.0.0'}
# Messaging is not a feed. The social list is for the scroll, not for talking
# to people, so the chat apps StevenBlack bundles with it are left out.
EXCLUDE = {'social': {'whatsapp.com', 'whatsapp.net', 'messenger.com', 'm.me', 'messages-facebook.com',
                      'telegram.org', 'telegram.me', 't.me', 'signal.org', 'wechat.com'}}
OUT = pathlib.Path(__file__).resolve().parent.parent / 'lists'


def domains(text, exclude=frozenset()):
    seen = set()
    for line in text.splitlines():
        line = line.split('#', 1)[0].strip().lower()
        if not line:
            continue
        parts = line.split()
        host = parts[1] if len(parts) > 1 else parts[0]
        host = host.removeprefix('www.')
        if host in NOISE or '.' not in host:
            continue
        if any(host == e or host.endswith('.' + e) for e in exclude):
            continue
        seen.add(host)

    # Drop anything already covered by a listed parent.
    def covered(h):
        labels = h.split('.')
        return any('.'.join(labels[i:]) in seen for i in range(1, len(labels) - 1))

    return sorted(h for h in seen if not covered(h))


def refilter():
    """Apply EXCLUDE to the bundled snapshots as they are. No download: the
    snapshot date in the header stays, only the count is brought up to date."""
    for name in LISTS:
        path = OUT / f'{name}.txt'
        exclude = EXCLUDE.get(name, frozenset())
        header, kept = [], []
        for line in path.read_text().splitlines():
            if line.startswith('#'):
                header.append(line)
            elif line and not any(line == e or line.endswith('.' + e) for e in exclude):
                kept.append(line)
        header = [f'# {len(kept)} domains, one per line; a domain covers its subdomains.'
                  if ' domains, one per line' in h else h for h in header]
        path.write_text('\n'.join(header + kept) + '\n')
        print(f'{name}: {len(kept)} domains')


def main():
    if '--refilter' in sys.argv[1:]:
        refilter()
        return
    OUT.mkdir(exist_ok=True)
    today = datetime.date.today().isoformat()
    for name, ext in LISTS.items():
        url = SRC.format(ext)
        with urllib.request.urlopen(url, timeout=120) as r:
            text = r.read().decode('utf-8', 'replace')
        ds = domains(text, EXCLUDE.get(name, frozenset()))
        header = (f'# Kindgate pause list: {name}\n'
                  f'# Source: {url}\n'
                  f'# StevenBlack/hosts, MIT licence (see lists/LICENSE). Snapshot {today}.\n'
                  f'# {len(ds)} domains, one per line; a domain covers its subdomains.\n')
        (OUT / f'{name}.txt').write_text(header + '\n'.join(ds) + '\n')
        print(f'{name}: {len(ds)} domains')


if __name__ == '__main__':
    main()
