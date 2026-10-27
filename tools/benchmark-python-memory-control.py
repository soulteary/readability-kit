#!/usr/bin/env python3
"""Additional paired full-worker runs to resolve RSS sampling uncertainty."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import random
import statistics
import sys

ROOT=Path(__file__).resolve().parent.parent

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--reference-python',required=True)
parser.add_argument('--reference-worker',required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
measure=load('process_measure',ROOT/'tools/benchmark-process.py')
paired=load('paired',ROOT/'tools/benchmark-python-paired.py')
folder=args.output.resolve();(folder/'memory-control-jobs').mkdir(parents=True,exist_ok=True)
corpus=[{'id':p.parent.name,'html':p.read_text(encoding='utf-8')} for p in (ROOT/'vendor/mozilla/test/test-pages').glob('*/source.html')]
corpus.sort(key=lambda c:(len(c['html'].encode()),c['id']))
commands={'optimized':[args.reference_python,args.reference_worker],
          'after':[sys.executable,str(ROOT/'tools/benchmark-python-worker.py')]}
jobs=[]
for rep in range(12):
    ordered=list(corpus);random.Random(20261027+6+rep).shuffle(ordered)
    for engine in ['chromium','mozilla']:
        request={'cases':[{**c,'options':{'url':'https://example.com/test/page.html','engine':engine}} for c in ordered],
                 'warmup':2,'iterations':3,'serialize':True,'allowEmpty':True}
        source=folder/'memory-control-input.json';source.write_text(json.dumps(request,ensure_ascii=False,separators=(',',':')))
        signatures=None
        for mode in (['optimized','after'] if rep%2==0 else ['after','optimized']):
            prefix=folder/'memory-control-jobs'/f'{rep}-{engine}-{mode}'
            spec={'command':commands[mode],'cwd':str(ROOT),'inputFile':str(source),
                  'stdoutFile':str(prefix)+'.stdout','stderrFile':str(prefix)+'.stderr','timeoutSeconds':600}
            Path(str(prefix)+'.spec.json').write_text(json.dumps(spec))
            stats=measure.measure(spec)
            if stats['exitCode'] or stats['timedOut']:raise RuntimeError(Path(spec['stderrFile']).read_text())
            result=json.loads(Path(spec['stdoutFile']).read_text());paired.validate_worker(result,[c['id'] for c in ordered],3)
            current=[(c['id'],c['lengths'],c['checksums'],c['statuses']) for c in result['cases']]
            if signatures is not None and current!=signatures:raise RuntimeError('Different output signatures')
            signatures=current
            jobs.append({'replicate':rep,'engine':engine,'mode':mode,'stats':stats})
    print(f'Memory control {rep+1}/12',flush=True)
report={'schema':1,'seedStart':20261033,'replicates':12,'jobs':jobs,'summary':{}}
rng=random.Random(20261027)
for engine in ['chromium','mozilla']:
    groups={mode:[j['stats']['maxRSSBytes']/1048576 for j in jobs if j['engine']==engine and j['mode']==mode] for mode in commands}
    ratios=[]
    for _ in range(5000):
        indices=[rng.randrange(12) for _ in range(12)]
        ratios.append(statistics.median(groups['after'][i] for i in indices)/statistics.median(groups['optimized'][i] for i in indices))
    ratios.sort()
    report['summary'][engine]={mode:{'p50MiB':statistics.median(v),'minMiB':min(v),'maxMiB':max(v)} for mode,v in groups.items()}
    report['summary'][engine]['ratio']=statistics.median(groups['after'])/statistics.median(groups['optimized'])
    report['summary'][engine]['ratio95Interval']=[ratios[125],ratios[4874]]
(folder/'memory-control.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['summary'],indent=2))
