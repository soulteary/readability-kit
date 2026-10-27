#!/usr/bin/env python3
"""Paired replicate bootstrap of review/optimization and review/original costs.

Intervals describe this finite local experiment. A <=1.05 upper bound is used
as evidence against a >5% resident-time regression, not proof of zero regression.
"""
import json
from pathlib import Path
import random
import statistics
import sys

source, destination = map(Path, sys.argv[1:])
raw = json.loads(source.read_text())
replicates = raw['replicates']
iterations = 2000
rng = random.Random(20261027)


def median(values):
    values = sorted(values)
    return values[(len(values)-1)//2]


def interval(values):
    values = sorted(values)
    return [values[int(.025*len(values))], values[int(.975*len(values))-1]]


report = {'schema': 1, 'replicates': replicates, 'bootstrapSamples': iterations,
          'method': 'Resample whole paired replicates with replacement; sum page nearest-rank medians.',
          'residentMaterialRegressionRatio': 1.05, 'engines': {}}
for engine in ('chromium', 'mozilla'):
    jobs = [j for j in raw['jobs'] if j['engine'] == engine and j['scope'] == 'full']
    by_mode = {mode: {j['replicate']: j for j in jobs if j['mode'] == mode}
               for mode in ['before', 'optimized', 'after']}
    samples = {mode: {rep: {case['id']: case['durationsNs'] for case in job['worker']['cases']}
                      for rep, job in group.items()} for mode, group in by_mode.items()}
    ids = list(samples['after'][0])
    def cost(mode, reps):
        return sum(median([value for rep in reps for value in samples[mode][rep][name]]) for name in ids)
    report['engines'][engine] = {}
    for baseline in ['before', 'optimized']:
        point = cost('after', range(replicates))/cost(baseline, range(replicates))
        boot, memory = [], []
        for _ in range(iterations):
            selected = [rng.randrange(replicates) for _ in range(replicates)]
            boot.append(cost('after', selected)/cost(baseline, selected))
            memory.append(statistics.median(by_mode['after'][i]['stats']['maxRSSBytes'] for i in selected)/
                          statistics.median(by_mode[baseline][i]['stats']['maxRSSBytes'] for i in selected))
        bounds = interval(boot)
        report['engines'][engine][baseline] = {
            'residentRatio': point, 'residentRatio95Interval': bounds,
            'residentUpperBelow105': bounds[1] <= 1.05,
            'rssRatio': statistics.median(j['stats']['maxRSSBytes'] for j in by_mode['after'].values())/
                        statistics.median(j['stats']['maxRSSBytes'] for j in by_mode[baseline].values()),
            'rssRatio95Interval': interval(memory)}
destination.write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
