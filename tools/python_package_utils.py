"""Shared checks for local Python packaging (also usable on Python 3.10)."""
from pathlib import Path, PurePosixPath
import shutil


def require(condition, message):
    if not condition:
        raise ValueError(message)


def extract_source(archive, destination):
    """Extract one regular-file source tree without links or path traversal.

    Validate the complete member list before writing anything. Do not depend on
    tarfile's filter= argument, which is absent in early supported Python 3.10.
    """
    destination = Path(destination)
    members = archive.getmembers()
    require(bool(members), 'Empty source archive')
    paths = []
    seen = set()
    roots = set()
    for member in members:
        path = PurePosixPath(member.name)
        require(member.name and bool(path.parts) and not path.is_absolute() and '\\' not in member.name
                and '..' not in path.parts and not any(':' in part for part in path.parts),
                f'Unsafe source path: {member.name}')
        require(all(not part.endswith(('.', ' ')) for part in path.parts),
                f'Non-portable source path: {member.name}')
        require(all(part.split('.')[0].casefold() not in {'con', 'prn', 'aux', 'nul',
                    *(f'com{i}' for i in range(1, 10)), *(f'lpt{i}' for i in range(1, 10))}
                    for part in path.parts), f'Reserved source path: {member.name}')
        require(member.isfile() or member.isdir(), f'Unsupported source member: {member.name}')
        normalized = path.as_posix().casefold().rstrip('/')
        require(normalized not in seen, f'Duplicate source path: {member.name}')
        seen.add(normalized)
        roots.add(path.parts[0])
        paths.append(path)
    require(len(roots) == 1, 'Source archive must contain one project root')
    destination.mkdir(parents=True, exist_ok=True)
    for member, path in zip(members, paths):
        target = destination.joinpath(*path.parts)
        require(target.resolve().is_relative_to(destination.resolve()), 'Source path escaped destination')
        if member.isdir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as source, target.open('xb') as output:
                shutil.copyfileobj(source, output)
            target.chmod(0o644 | (member.mode & 0o111))
    return destination / next(iter(roots))
