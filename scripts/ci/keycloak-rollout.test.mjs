import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
const script=path.resolve(import.meta.dirname,'wait-for-keycloak-rollout.sh');
const jqAvailable=spawnSync('jq',['--version']).status===0;
const digest='sha256:'+'a'.repeat(64),image='ghcr.io/mednov-ai/playsay-keycloak@'+digest;
function run(change=()=>{},inputDigest=digest) {
 const dir=mkdtempSync(path.join(tmpdir(),'honey-keycloak-rollout-'));
 try {
  mkdirSync(path.join(dir,'bin'));
  const state={metadata:{generation:2},spec:{replicas:1,template:{spec:{containers:[{image}]}}},status:{observedGeneration:2,currentRevision:'new',updateRevision:'new',readyReplicas:1,updatedReplicas:1}};
  const pods={items:[{status:{phase:'Running',containerStatuses:[{ready:true,restartCount:0,imageID:image}]}}]};
  change(state,pods);
  writeFileSync(path.join(dir,'state.json'),JSON.stringify(state));writeFileSync(path.join(dir,'pods.json'),JSON.stringify(pods));writeFileSync(path.join(dir,'image-digest.txt'),inputDigest);
  writeFileSync(path.join(dir,'bin/kubectl'),'#!/bin/sh\ncase "$*" in *"get statefulset"*) cat "$WORKSPACE/state.json";; *"get pods"*) cat "$WORKSPACE/pods.json";; *) exit 9;; esac\n',{mode:0o755});
  return spawnSync(script,[],{encoding:'utf8',env:{...process.env,PATH:dir+'/bin:'+process.env.PATH,WORKSPACE:dir,BUILD_LABEL:'fixture',PLAYSAY_DEV_ROLLOUT_TIMEOUT_SECONDS:'1',PLAYSAY_DEV_ROLLOUT_POLL_SECONDS:'1'},timeout:10000});
 } finally {rmSync(dir,{recursive:true,force:true});}
}
test('Keycloak gate accepts the exact ready digest and zero-restart pods',{skip:!jqAvailable},()=>{const r=run();assert.equal(r.status,0,r.stderr);});
for(const [name,change] of [
 ['old healthy digest',s=>s.spec.template.spec.containers[0].image='ghcr.io/mednov-ai/playsay-keycloak@sha256:'+'b'.repeat(64)],
 ['unobserved generation',s=>s.status.observedGeneration=1],
 ['old StatefulSet revision',s=>s.status.currentRevision='old'],
 ['missing readiness',s=>s.status.readyReplicas=0],
 ['restarted container',(s,p)=>p.items[0].status.containerStatuses[0].restartCount=1],
 ['wrong running image',(s,p)=>p.items[0].status.containerStatuses[0].imageID='old'],
 ['missing pods',(s,p)=>p.items=[]],
])test('Keycloak gate rejects '+name,{skip:!jqAvailable},()=>assert.notEqual(run(change).status,0));
test('Keycloak gate rejects malformed digest before waiting',()=>assert.notEqual(run(()=>{},'sha256:malformed').status,0));
