#!/usr/bin/env python3
"""Aggregate diagnostic phases; no extraction or timing is performed here."""
import json
from pathlib import Path
import statistics
import sys
from python_package_utils import require

PHASES = ['pythonPrepareNs', 'nativeOptionsNs', 'nativeExtractNs', 'nativeConvertNs',
          'boundaryResidualNs', 'pythonDecodeArticleNs', 'toDictNs', 'pythonJSONNs']


def stats(values):
    values = sorted(values)
    return {'n': len(values), 'meanNs': statistics.mean(values),
            'p50Ns': values[(len(values)-1)//2],
            'p95Ns': values[max(0, (95*len(values)+99)//100-1)],
            'minNs': values[0], 'maxNs': values[-1]}


def main():
    source, destination = map(Path, sys.argv[1:])
    raw = json.loads(source.read_text())
    require(isinstance(raw['replicates'], int) and raw['replicates'] > 0, 'Invalid replicate count')
    require(len(raw['jobs']) == raw['replicates'] * 4, 'Missing or extra profile jobs')
    first_full = next(j for j in raw['jobs'] if j['scope'] == 'full')
    corpus_ids = set(raw.get('corpusCaseIds', [c['id'] for c in first_full['cases']]))
    require(bool(corpus_ids), 'Empty profile corpus')
    result = {'schema': 1, 'nativeSha256': raw['nativeSha256'], 'engines': {},
              'method': 'Sum of per-page mean diagnostic phase durations, not public benchmark medians.'}
    for engine in ('chromium', 'mozilla'):
        result['engines'][engine] = {}
        for scope in ('full', 'detail'):
            jobs = [j for j in raw['jobs'] if j['engine'] == engine and j['scope'] == scope]
            require(len(jobs) == raw['replicates'], 'Missing profile replicates')
            require({j['replicate'] for j in jobs} == set(range(raw['replicates'])),
                    'Duplicate or invalid profile replicate')
            expected_ids = corpus_ids if scope == 'full' else set(raw['detailedCaseIds'])
            samples = {}
            for job in jobs:
                ids = [case['id'] for case in job['cases']]
                require(len(ids) == len(set(ids)) and set(ids) == expected_ids,
                        'Missing, extra or duplicate profile cases')
                for case in job['cases']:
                    require(len(case['samples']) == (3 if scope == 'full' else 10),
                            'Wrong profile sample count')
                    for row in case['samples']:
                        require(sum(row[k] for k in PHASES) == row['totalNs'], 'Incorrect phase total')
                        require(all(type(row[k]) is int and row[k] >= 0 for k in PHASES)
                                and type(row['totalNs']) is int and row['totalNs'] > 0,
                                'Invalid profile duration')
                    samples.setdefault(case['id'], []).extend(case['samples'])
            expected = raw['replicates'] * (3 if scope == 'full' else 10)
            require(all(len(rows) == expected for rows in samples.values()), 'Wrong combined sample count')
            cases = {name: {phase: stats([row[phase] for row in rows])
                            for phase in [*PHASES, 'totalNs']}
                     for name, rows in samples.items()}
            totals = {phase: sum(case[phase]['meanNs'] for case in cases.values())
                      for phase in [*PHASES, 'totalNs']}
            result['engines'][engine][scope] = {'cases': cases, 'sumPageMeansNs': totals}
    destination.write_text(json.dumps(result, indent=2)+'\n')


if __name__ == '__main__':
    main()
