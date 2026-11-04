"""Change only the exact upstream build option and label the custom RPM."""
from pathlib import Path
import sys

path = Path(sys.argv[1])
lines = path.read_text().splitlines(keepends=True)
fts = [i for i, line in enumerate(lines) if line.strip() == '--enable-fts5 \\']
release = [i for i, line in enumerate(lines) if line.strip() == 'Release: 11%{?dist}']
if len(fts) != 1 or len(release) != 1:
    raise SystemExit('Unexpected vendor spec; refusing to modify it')
lines[fts[0]] = lines[fts[0]].replace('--enable-fts5', '--disable-fts5')
lines[release[0]] = lines[release[0]].replace('11%{?dist}', '11.playfix1%{?dist}')
path.write_text(''.join(lines))
