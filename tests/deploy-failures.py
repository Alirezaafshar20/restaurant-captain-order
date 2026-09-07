"""Exercise the actual deploy script with isolated paths and injected command failures.

No server, Docker daemon, remote Git repository or root access is used. Only the
root check and absolute server paths are adapted to a temporary test directory.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile

MOCK = r'''#!/usr/bin/env python3
import json,os,sys,fcntl
from pathlib import Path
cmd=Path(sys.argv[0]).name; args=sys.argv[1:]
root=Path(os.environ['MOYA_TEST_ROOT']); scenario=os.environ['MOYA_TEST_SCENARIO']
if cmd=='curl' and '--header' in args: sys.stdin.read()
lock=(root/'mock.lock').open('w')
fcntl.flock(lock,fcntl.LOCK_EX)
state_path=root/'mock-state.json'; state=json.loads(state_path.read_text())
state['calls'].append([cmd,*args]); sha='b'*40
def done(code=0, output=''):
 state_path.write_text(json.dumps(state))
 if output: print(output)
 sys.exit(code)
if cmd=='git':
 if 'fetch' in args: done(1 if scenario=='fetch-failure' else 0)
 if 'fsck' in args: done(1 if scenario=='corrupt-source' else 0)
 if 'init' in args: Path(args[-1]).mkdir(); done()
 if 'ls-remote' in args:
  state['remote_reads']=state.get('remote_reads',0)+1
  done(output=('c'*40 if scenario=='branch-advanced' and state['remote_reads']>1 else sha)+'\trefs/heads/main')
 if 'worktree' in args: Path(args[-2]).mkdir(parents=True); done()
 if 'rev-parse' in args: done(output=sha)
 if 'status' in args: done(output='?? missing-source' if scenario=='dirty-source' else '')
 done()
if cmd=='docker':
 if args[0]=='build': done(1 if scenario=='build-failure' else 0)
 if args[:2]==['image','inspect']: done(output='c'*40 if scenario=='wrong-image' else sha)
 if args[:2]==['container','inspect']: done(0 if args[-1] in state['containers'] else 1)
 if args[0]=='inspect': done(output='true')
 if args[0]=='exec':
  name=args[1]
  if '--input-type=module' in args: done(output='Authorization: Basic dGVzdDp0ZXN0')
  if name!='moya-aaaaaaaaaaaa-1':
   if scenario=='preflight-failure' or (scenario=='live-failure' and state.get('runs',0)>1): done(1)
  done()
 if args[0]=='run':
  if '--name' in args:
   published=args[args.index('--publish')+1]
   if published==f"127.0.0.1:{state['active_port']}:3000": done(1)
   state['runs']=state.get('runs',0)+1
   state['containers'].append(args[args.index('--name')+1])
  done(output='test-container')
 if args[0]=='rm':
  state['containers'].remove(args[-1]); done()
 done()
if cmd=='nginx':
 if scenario=='nginx-failure' and '3102' in (root/'etc/nginx/moya-upstream.conf').read_text(): done(1)
 done()
if cmd=='curl':
 state['curl_reads']=state.get('curl_reads',0)+1
 switched=str(state['active_port']) not in (root/'etc/nginx/moya-upstream.conf').read_text()
 if scenario=='proxy-failure' and switched: done(output='503')
 if scenario=='delayed-reload' and switched and state['curl_reads']<5: done(output='502')
 if args[-1].endswith('/healthz'):
  release='a'*40 if not switched or scenario=='wrong-release' else sha
  Path(args[args.index('--output')+1]).write_text(json.dumps({'ok':True,'release':release}))
  done(output='200')
 done(output='401')
if cmd=='systemctl':
 if scenario=='reload-failure' and '3102' in (root/'etc/nginx/moya-upstream.conf').read_text(): done(1)
 done()
if cmd in ('sleep','chown'): done()
if cmd=='install':
 Path(args[-1]).mkdir(parents=True,exist_ok=True); done()
done(1)
'''

script = Path('deploy/deploy.sh').read_text()
root_check = "[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash deploy.sh'; exit 1; }"
assert root_check in script
scenarios = ['fetch-failure', 'corrupt-source', 'dirty-source', 'build-failure',
             'wrong-image', 'branch-advanced', 'preflight-failure', 'live-failure',
             'nginx-failure', 'reload-failure', 'proxy-failure', 'wrong-expected-sha',
             'wrong-release', 'success', 'success-other-port', 'success-first', 'delayed-reload']
for scenario in scenarios:
    with tempfile.TemporaryDirectory(prefix='moya-deploy-test-') as directory:
        root = Path(directory)
        for name in ('bin','opt/moya/releases','opt/moya/preflight','opt/moya/backups','opt/moya/data','etc/moya','etc/nginx/conf.d'):
            (root/name).mkdir(parents=True, exist_ok=True)
        (root/'etc/moya/deploy.conf').write_text('REPO_URL=git@github.com:Alirezaafshar20/moya-captain-order.git\nBRANCH=main\n')
        (root/'etc/moya/app.env').write_text('PUBLIC_ORIGIN=https://192.0.2.1\n')
        (root/'etc/nginx/conf.d/moya-app.conf').write_text('# test placeholder\n')
        upstream = root/'etc/nginx/moya-upstream.conf'
        active_port = 3102 if scenario=='success-other-port' else 3101
        next_port = 3101 if active_port==3102 else 3102
        upstream.write_text(f'proxy_pass http://127.0.0.1:{active_port};\n')
        active = root/'opt/moya/active.json'
        original = {'container':'moya-aaaaaaaaaaaa-1','sha':'a'*40,'image':'moya:old','port':active_port}
        if scenario!='success-first': active.write_text(json.dumps(original))
        state_file = root/'mock-state.json'
        state_file.write_text(json.dumps({'calls':[], 'active_port':active_port,
            'containers':[] if scenario=='success-first' else [original['container']]}))
        for name in ('git','docker','nginx','curl','systemctl','sleep','chown','install'):
            tool = root/'bin'/name; tool.write_text(MOCK); tool.chmod(0o755)
        adapted = script.replace(root_check, ': # root check is outside this isolated test')
        adapted = adapted.replace('/opt/moya',str(root/'opt/moya')).replace('/etc/',str(root/'etc')+'/')
        runner = root/'deploy.sh'; runner.write_text(adapted)
        args = ['bash', str(runner)]
        if scenario=='wrong-expected-sha': args += ['--expect-sha','d'*40]
        result = subprocess.run(args, env={**os.environ, 'PATH':str(root/'bin')+os.pathsep+os.environ['PATH'],
            'MOYA_TEST_ROOT':str(root),'MOYA_TEST_SCENARIO':scenario}, capture_output=True,text=True,timeout=30)
        state = json.loads(state_file.read_text())
        if scenario.startswith('success') or scenario=='delayed-reload':
            assert result.returncode==0, result.stdout+result.stderr
            assert json.loads(active.read_text())['sha']=='b'*40
            assert str(next_port) in upstream.read_text()
            assert original['container'] not in state['containers']
            assert len(state['containers'])==1
        else:
            assert result.returncode!=0, f'{scenario}: failed to reject release'
            assert json.loads(active.read_text())==original, f'{scenario}: changed committed release'
            assert '3101' in upstream.read_text(), f'{scenario}: routing was not recovered'
            assert state['containers']==[original['container']], f'{scenario}: stopped old release or leaked candidate'
        assert not (root/'opt/moya/pending.json').exists()
        print('PASS deployment scenario:',scenario)
